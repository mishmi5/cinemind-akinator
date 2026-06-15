import { NextResponse } from 'next/server';
import { brainRecommend, recReason, type BrainHistoryItem } from '@/lib/brain/tasteBrain';
import { brainBackend } from '@/lib/brain/model';
import { fetchCandidatePool, fetchPoolByHint, fetchSubGenreSampler, samplerProbeOf, samplerTier, subGenreFamily, recommendBySubGenre, movieById, resolveByTitle, getTrailer, genreNames } from '@/lib/brain/tmdb';

// Taste-brain quiz endpoint (Akinator-style). DETERMINISTIC sub-genre navigation:
// the route — not the LLM — decides what to ask. Why: a 14B local model is unreliable
// at per-turn navigation (it would conclude "psychological horror" for BOTH a slasher
// and a hard-SF fan). Instead we PROBE distinct sub-genres with iconic exemplars,
// SCORE each sub-genre from the user's literal 1-5 ratings, DRILL the loved one to
// confirm it's a pattern (not a fluke), and only then hand the LLM a single job:
// name 3 real titles squarely inside the confirmed sub-genre. TMDB grounds everything.

const MIN_Q = 5;        // never finish before this many ratings
const MAX_Q = 58;       // hard cap on RATED answers — full sub-genre sweep (~47) + drill
const SHOWN_CAP = 75;   // hard cap on TOTAL movies shown (incl "didn't see") — guarantees the
                        // quiz always terminates even for a user who's seen few films
const HI = 4;           // a rating ≥ HI is a "strong hit" toward a sub-genre
const LO = 2;           // a rating ≤ LO is a "miss" against a sub-genre
const LOCK_HITS = 2;    // a loved sub-genre is CONFIRMED at this many strong hits (iconic 5★)

// Per sub-genre we track strong-hit COUNT, not just average: a noisy drill pool (TMDB's
// "slasher" keyword also returns art-horror) yields a few low ratings that would sink an
// average below threshold even when the user clearly loves the genre. Counting ≥4 hits is
// robust to that dilution — three confirmed Halloween/Friday-13th 5★ lock it regardless.
// `contra` counts CONTRADICTIONS for this sub-genre: a rating that reverses an already-
// established signal (a loved sub-genre suddenly rated low, or a rejected one rated high).
// Each contradiction lowers confidence and withholds the lock until the term is re-confirmed
// — the meter deliberately drops so the quiz lengthens in exchange for a more accurate result.
type ProbeScores = Record<string, { sum: number; n: number; hi: number; lo: number; contra?: number }>;

// Cross-over family adjacency for the early-stop (e.g. cosmic-horror ↔ hard-SF, thrillers
// span crime/action). A leader can only early-lock once its family AND these neighbours are
// explored, so a true love in an adjacent family is never skipped.
const FAMILY_ADJ: Record<string, string[]> = {
  horror: ['scifi'], scifi: ['horror', 'action'], action: ['crime', 'scifi'],
  crime: ['action', 'drama'], comedy: ['drama'], drama: ['comedy', 'crime'],
  western: ['action', 'drama'], animation: [], fantasy: ['scifi', 'action'],
};

function questionText(title: string, locale: string): string {
  const he = [
    `כמה כוכבים תיתן ל"${title}"? (1 = שונא, 5 = אוהב)`,
    `"${title}" — בקטע שלך או פספוס מוחלט?`,
    `נתקלת ב"${title}". מה הדירוג שלך?`,
    `עד כמה "${title}" מדבר אליך?`,
  ];
  const en = [
    `How many stars for "${title}"? (1 = hate, 5 = love)`,
    `"${title}" — your thing or a total miss?`,
    `You run into "${title}". Your rating?`,
    `How much does "${title}" speak to you?`,
  ];
  const pool = locale === 'en' ? en : he;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Resolve which sub-genre term a just-rated movie belongs to: a sampler exemplar
// carries its term in samplerProbeMap; a drilled movie carries the active drill hint.
function termOf(movieId: string, activeHint: string): string | null {
  return samplerProbeOf(movieId) || (activeHint || null);
}

const CONTENDER_AVG = 4.5; // a 5★-level love; close contenders at/above this drill-off

// Stable per-session pseudo-random rank (FNV-1a). Seeds the EXPLORE sweep ORDER off the
// sessionId so two users never get the same opening sequence — variety — while a single
// session's order stays consistent across its turns (sessionId round-trips in the body).
// Order is correctness-neutral: the full sweep still covers every sub-genre.
function seededRank(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) / 0xffffffff;
}

function computeTaste(probe: ProbeScores) {
  const stats = Object.entries(probe).map(([t, { sum, n, hi, lo, contra }]) => ({ t, n, hi, lo, contra: contra || 0, avg: sum / n, hiRate: hi / n }));
  const totalContra = stats.reduce((a, s) => a + s.contra, 0);
  const disliked = stats.filter(s => s.lo >= 2 && s.hi === 0).map(s => s.t);
  // The LEAD candidate: strongest signal — most strong hits, then highest average. The
  // avg tiebreak separates a true love (Arrival/Ex Machina = 5) from a cross-genre stray
  // hit (The Thing = 4).
  const candidates = stats.filter(s => s.hi >= 1 && s.avg >= 3.5).sort((a, b) => b.hi - a.hi || b.avg - a.avg);
  const leader = candidates[0] || null;
  // CONTENDERS — sub-genres in a close 5★ race with the leader. When several neighbours
  // tie (a body-horror fan rating both "The Fly" and "Evil Dead" a 5), we must DRILL each
  // (its 2nd exemplar + keyword pool) before locking, so hit-count + avg pick the real one
  // instead of an arbitrary list-order tiebreak. This is the "drill-off".
  const contenders = candidates.filter(s => s.avg >= CONTENDER_AVG);
  // Lock ONLY when the leader is confirmed AND every close contender has had its 2nd
  // exemplar drilled (n ≥ 2) — i.e. the race is settled. A CONTRADICTION on the leader
  // raises the bar: each one demands an extra confirming strong hit, so a user who flip-
  // flopped on their "loved" sub-genre must re-prove it before we lock.
  const lockHitsNeeded = LOCK_HITS + (leader?.contra || 0);
  const lockedLove = (leader && leader.hi >= lockHitsNeeded && contenders.every(s => s.n >= 2)) ? leader : null;
  // "loved", for the recommendation prompt — confirmed-ish sub-genres, lead first.
  const loved = candidates.filter(s => s.hi >= 2 || s === leader);
  return { stats, candidates, leader, contenders, loved, disliked, lockedLove, totalContra };
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const locale = req.headers.get('x-locale') || 'he';
    const askedMovieIds: string[] = JSON.parse(req.headers.get('x-asked-ids') || '[]');
    const recentIds: string[] = JSON.parse(req.headers.get('x-recent-ids') || '[]');
    // Non-ASCII (Hebrew) titles can't ride HTTP headers, so taste state lives in the BODY.
    let history: BrainHistoryItem[] = Array.isArray(payload.ratingHistory) ? payload.ratingHistory : [];
    const probe: ProbeScores = (payload.probeScores && typeof payload.probeScores === 'object') ? payload.probeScores : {};
    // The hint that produced the movie just answered (round-tripped from the prior response).
    const activeHint = typeof payload.searchHint === 'string' ? payload.searchHint.trim() : '';
    // SESSION-scoped count of "didn't see" answers (round-trips in the body). The completion
    // cap must be based on movies shown THIS quiz — NOT the cross-quiz `x-asked-ids` list
    // (which carries variety/dedup history from prior quizzes and would otherwise trip the
    // cap instantly for a returning user → quiz jumps straight to recommendations).
    let notSeen = typeof payload.notSeen === 'number' ? payload.notSeen : 0;

    const backend = brainBackend();
    const mock = req.headers.get('x-brain-mock') === '1' || process.env.BRAIN_MOCK === '1';
    // Derived early so it can seed the per-session sweep order (variety) below.
    const sessionId = payload.sessionId || `brain_${Date.now()}`;

    // ── Record the just-answered movie (rated answers only; NOT_SEEN is an omitted
    //    item — it never enters taste reasoning). Also score its sub-genre probe. ──
    if (!payload.isInit && payload.movieId && typeof payload.answer === 'number') {
      if (!askedMovieIds.includes(payload.movieId)) askedMovieIds.push(payload.movieId);
      history = [...history, {
        title: payload.title || 'Unknown',
        year: payload.year || undefined,
        genres: genreNames(payload.genreIds || []),
        rating: payload.answer,
      }];
      const term = termOf(String(payload.movieId), activeHint);
      if (term) {
        const cur = probe[term] || { sum: 0, n: 0, hi: 0, lo: 0, contra: 0 };
        // CONTRADICTION: this rating reverses an established signal for the same sub-genre.
        // If the term was already LOVED (a strong hit, avg ≥ HI) and the user now rates a
        // fresh exemplar a MISS (≤ LO) — or the term was REJECTED and is now a strong hit —
        // the taste hypothesis just wavered. Count it: confidence will drop and the lock is
        // withheld until re-confirmed (a deliberately slower, more accurate quiz).
        let contra = cur.contra || 0;
        if (cur.n >= 1) {
          const priorAvg = cur.sum / cur.n;
          const wasLoved = cur.hi >= 1 && priorAvg >= HI;
          const wasRejected = cur.lo >= 2 && cur.hi === 0;
          if (wasLoved && payload.answer <= LO) contra += 1;
          if (wasRejected && payload.answer >= HI) contra += 1;
        }
        probe[term] = {
          sum: cur.sum + payload.answer, n: cur.n + 1,
          hi: cur.hi + (payload.answer >= HI ? 1 : 0),
          lo: cur.lo + (payload.answer <= LO ? 1 : 0),
          contra,
        };
      }
    } else if (!payload.isInit && payload.movieId && typeof payload.answer !== 'number') {
      if (!askedMovieIds.includes(payload.movieId)) askedMovieIds.push(payload.movieId);
      notSeen += 1; // NOT_SEEN: no taste signal, but it IS a movie shown this session
    }

    const seen = Array.from(new Set([...askedMovieIds, ...recentIds]));
    const seenSet = new Set(seen);
    const { loved, leader, contenders, disliked, lockedLove, totalContra } = computeTaste(probe);

    // ── Decide the next move DETERMINISTICALLY: EXPLORE before EXPLOIT. ──
    // EXPLORE: walk EVERY distinct sub-genre once (iconic exemplar each) before committing
    // to any one. This is what stops a cross-genre stray hit (a hard-SF fan rating "The
    // Thing" a 4) from hijacking the quiz before its true love (hard-SF) is ever shown.
    // EXPLOIT: only once the full sweep is done, DRILL the strongest explored sub-genre
    // to confirm it (LOCK_HITS strong hits). Recommend only from the confirmed sub-genre.
    const samplerAll = (await fetchSubGenreSampler(locale)).filter(c => !seenSet.has(c.id));
    const uncovered = samplerAll
      .filter(c => { const t = samplerProbeOf(c.id); return t && !probe[t] && !disliked.includes(t); });
    const sweepDone = uncovered.length === 0;
    // EARLY-STOP (adaptive length): if the leader is a PERFECT 5★ love AND its whole family
    // has been explored — so every close neighbour was compared and the drill-off settled —
    // we may exploit without sweeping the remaining families. A focused taste (all 5s for
    // one sub-genre, neutral elsewhere) thus finishes in ~13 questions; an ambiguous taste
    // (no perfect 5★) keeps exploring to the full sweep. avg===5 is only reachable when
    // EVERY rating for that sub-genre was a strict-bullseye 5, so it can't be a stray hit.
    const leaderFam = leader ? subGenreFamily(leader.t) : undefined;
    // Families that share cross-over sub-genres (e.g. a hard-SF fan also rates cosmic-horror
    // high). Before early-stopping on a leader, its family AND these adjacent families must
    // be explored, so the true love in a neighbour family isn't skipped.
    const adj = leaderFam ? (FAMILY_ADJ[leaderFam] || []) : [];
    const famsToClear = leaderFam ? [leaderFam, ...adj] : [];
    const leaderFamilyExplored = famsToClear.length > 0 &&
      !uncovered.some(c => famsToClear.includes(subGenreFamily(samplerProbeOf(c.id) || '') || ''));
    const earlyExploit = !!leader && leader.avg === 5 && leader.hi >= 1 && leaderFamilyExplored && history.length >= MIN_Q;
    const exploitNow = sweepDone || earlyExploit;
    // DRILL-OFF: drill the least-explored close contender first so every 5★ neighbour gets
    // its 2nd exemplar before we lock; once all are drilled, fall to the leader. Data-driven
    // tiebreak (the real love accrues more hits from its own keyword pool) instead of list
    // order. Never drill mid-sweep unless early-stop conditions hold.
    const needDrill = contenders.filter(s => s.n < 2).sort((a, b) => a.n - b.n || b.avg - a.avg);
    const drillTarget = !lockedLove && exploitNow ? (needDrill[0] || leader) : null;
    let pool: Awaited<ReturnType<typeof fetchCandidatePool>>;
    let nextHint = '';
    if (drillTarget) {
      // EXPLOIT — confirm with the target sub-genre's 2nd CURATED iconic exemplar first
      // (a reliable, recognizable test), falling back to the keyword pool. The keyword
      // pool alone is noisy (TMDB "slasher" also returns torture-porn the user rejects),
      // which would dilute the signal and prevent a clean lock.
      const curated = samplerAll.filter(c => samplerProbeOf(c.id) === drillTarget.t);
      const drilled = curated.length ? curated : await fetchPoolByHint(drillTarget.t, seen, locale, 10);
      pool = drilled.length ? drilled : samplerAll;
      nextHint = drillTarget.t;
    } else if (!sweepDone) {
      // EXPLORE — serve a not-yet-probed sub-genre. TIER-1 popular openers go FIRST (so the
      // opening ~25 questions are household-name blockbusters the user has actually seen —
      // real early signal, almost no "didn't see"), THEN tier-2 niche exemplars deepen toward
      // surgical resolution. Within a tier the order is per-session SHUFFLED (seeded by
      // sessionId) so no two questionnaires open the same. Order is correctness-neutral.
      // Seed by MOVIE id (not term): families with several popular openers thus surface a
      // DIFFERENT film per session (and in a different order). Once a family is probed its
      // other openers drop from `uncovered`, so each session still asks ~one per family —
      // but a fresh, reshuffled set every time. Rich opening variety, never the same quiz.
      const nextUp = [...uncovered].sort((a, b) =>
        (samplerTier(a.id) - samplerTier(b.id)) ||
        (seededRank(sessionId + a.id) - seededRank(sessionId + b.id)));
      pool = [nextUp[0]];
      nextHint = ''; // sampler movies carry their own term via samplerProbeMap
    } else {
      pool = samplerAll.length ? samplerAll : await fetchCandidatePool(seen, locale, 8);
    }
    if (!pool || pool.length === 0) pool = await fetchCandidatePool(seen, locale, 12);

    const baseState = {
      sessionId, historyCount: history.length, ratedCount: history.length,
      askedMovieIds, userAffinities: {}, ratingHistory: history, probeScores: probe, engine: 'brain',
      notSeen, // session-scoped "didn't see" count, round-trips so the shown-cap stays per-quiz
    };

    // ── Honest progress: confidence reflects genuine sub-genre understanding, not click
    //    count. It climbs only as a loved sub-genre accumulates confirming ratings. ──
    // Honest progress blends sweep coverage with lock confirmation, so the meter reflects
    // real understanding, not click count.
    // Smooth, honest meter: three continuous components so it climbs GRADUALLY (no long
    // plateau then a jump). (a) sweep coverage, (b) rated-count progress — keeps inching up
    // as the user answers, (c) leader strength as a CONTINUOUS value (hits + how far the avg
    // sits above neutral), not a binary lock. A real lock pins it to ~1.
    const sweepProgress = Math.min(1, Object.keys(probe).length / 12);
    const ratedProgress = Math.min(1, history.length / 28);
    const leaderStrength = lockedLove ? 1 : (leader ? Math.min(1, (leader.hi + Math.max(0, leader.avg - 3) / 2) / 3) : 0);
    // Each unresolved contradiction PULLS THE METER DOWN (0.15 apiece, capped) — the user
    // sees the percentage drop after a taste-reversing answer, signalling the engine is
    // re-checking rather than racing to a guess. Floored so it never reads as total reset.
    const contraPenalty = Math.min(0.5, (totalContra || 0) * 0.15);
    const confidence = Math.max(0.05, Math.min(0.98, 0.30 * sweepProgress + 0.22 * ratedProgress + 0.48 * leaderStrength) - contraPenalty);

    // ── Completion: the lead sub-genre is confirmed (LOCK_HITS strong hits), or hard cap.
    //    A lock is only reachable by drilling, which means real confirmation. ──
    // Two caps: MAX_Q on RATED answers, and a TOTAL-SHOWN cap on movies presented (incl.
    // "didn't see"). The latter guarantees the quiz ALWAYS terminates — without it a user who
    // hasn't seen many films could be shown 100+ cards and never reach recs (the frozen-meter
    // bug). At the shown cap we finish with the best signal gathered so far.
    const atCap = history.length >= MAX_Q;
    const atShownCap = (history.length + notSeen) >= SHOWN_CAP; // session-scoped, not cross-quiz
    const done = atCap || atShownCap || (history.length >= MIN_Q && !!lockedLove);

    if (!done) {
      // Serve the next question — always a real pool movie.
      const picked = pool[Math.floor(Math.random() * pool.length)];
      const movie = picked ? await movieById(picked.id, locale) : null;
      if (movie) {
        movie.trailerId = await getTrailer(movie.id);
        const tasteSummary = lockedLove ? `Confirming: ${lockedLove.t}` : leader ? `Closing in on: ${leader.t}` : 'Mapping your taste…';
        return NextResponse.json({
          ...baseState, tasteSummary, searchHint: nextHint,
          isComplete: false, confidenceScore: confidence, progressPercent: Math.min(99, Math.round(confidence * 100)),
          currentVectorState: { possibleMoviesRemaining: Math.max(2, Math.round(50000 * (1 - confidence))), leadingMicroGenres: [tasteSummary] },
          currentQuestion: { id: `bq_${Date.now()}`, text: questionText(movie.title, locale), movie },
          finalMovies: undefined,
        }, { status: 200 });
      }
    }

    // ── DONE — SURGICAL recommendation. The confirmed sub-genre drives a DETERMINISTIC
    //    pick from curated canonical seeds (pure, judge-defensible, no LLM title drift, no
    //    keyword noise). The LLM is used only to write the natural-language REASONS over
    //    the already-chosen films, so it can't contaminate the selection. ──
    const confirmedTerm = (lockedLove?.t || leader?.t || loved[0]?.t || '');
    let resolved: NonNullable<Awaited<ReturnType<typeof movieById>>>[] = [];
    if (confirmedTerm) {
      resolved = await recommendBySubGenre(confirmedTerm, askedMovieIds, locale, 3);
    }
    // Fallbacks if curated seeds were exhausted/unresolved: keyword pool, then the LLM.
    if (resolved.length < 3 && confirmedTerm) {
      const fill = await fetchPoolByHint(confirmedTerm, seen, locale, 12);
      for (const c of fill) {
        if (resolved.length >= 3) break;
        if (resolved.some(m => m.id === c.id) || askedMovieIds.includes(c.id)) continue;
        const m = await movieById(c.id, locale);
        if (m) resolved.push(m);
      }
    }
    if (resolved.length < 3) {
      const recPass = await brainRecommend(history, { mock, loved: loved.map(s => s.t), disliked });
      for (const r of recPass?.recommendations || []) {
        if (resolved.length >= 3) break;
        const m = await resolveByTitle(r.title, r.year != null ? String(r.year) : null, locale);
        if (m && !resolved.some(x => x.id === m.id) && !askedMovieIds.includes(m.id)) resolved.push(m);
      }
    }
    // Last-resort guarantee: a customer must NEVER see fewer than 3 recs (the frozen/empty-
    // recs bug). If signal was too thin to confirm a sub-genre, fill from the popular pool.
    if (resolved.length < 3) {
      const pop = await fetchCandidatePool(seen, locale, 20);
      for (const c of pop) {
        if (resolved.length >= 3) break;
        if (resolved.some(m => m.id === c.id) || askedMovieIds.includes(c.id)) continue;
        const m = await movieById(c.id, locale);
        if (m) resolved.push(m);
      }
    }

    const tasteSummary = confirmedTerm ? `Loves ${confirmedTerm}` : 'Eclectic taste';

    const uniq: typeof resolved = [];
    const seenRec = new Set<string>();
    for (const m of resolved) { if (!seenRec.has(m.id)) { seenRec.add(m.id); uniq.push(m); } }
    const picks = uniq.slice(0, 3);
    for (const p of picks) p.trailerId = await getTrailer(p.id);

    // The local model (gemma2) writes the natural-language reason in the user's language —
    // this is the customer-facing "answer" the LLM provides. Generated in parallel over the
    // already-chosen films, so it cannot affect the surgical selection.
    const yearOf = (p: typeof picks[number]) => (p.originalDetails || '').match(/(\d{4})/)?.[1];
    const reasons = await Promise.all(picks.map(p =>
      recReason({ title: p.title, year: yearOf(p), term: confirmedTerm || 'this style', locale, mock })));

    const finalMovies = picks.map((p, i) => ({
      id: `res_${p.id}`, title: p.title,
      matchScore: Math.round(99 - i * 4),
      posterUrl: p.posterUrl, trailerId: p.trailerId, overview: p.overview,
      _genreIds: p._genreIds,
      reason: reasons[i] || (confirmedTerm ? `A canonical ${confirmedTerm} pick` : ''),
    }));

    return NextResponse.json({
      ...baseState, tasteSummary,
      isComplete: true, confidenceScore: 1.0, progressPercent: 100,
      currentVectorState: { possibleMoviesRemaining: 1, leadingMicroGenres: [tasteSummary] },
      currentQuestion: null, finalMovies,
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Brain error: ' + String(error) }, { status: 500 });
  }
}
