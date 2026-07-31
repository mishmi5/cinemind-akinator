import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { getSession, startSession, saveSession, isVerified } from '@/lib/brain/sessionStore';
import { recReason, directRecs, type BrainHistoryItem } from '@/lib/brain/tasteBrain';
import { brainBackend } from '@/lib/brain/model';
import { allSubGenreTerms, fetchCandidatePool, fetchFamilyPool, fetchPoolByHint, fetchSeedCandidates, fetchSubGenreSampler, samplerProbeOf, samplerTier, subGenreFamily, recommendBySubGenre, movieById, getTrailer, getWatchProviders, genreNames } from '@/lib/brain/tmdb';

// Taste-brain quiz endpoint (Akinator-style). DETERMINISTIC sub-genre navigation:
// the route — not the LLM — decides what to ask. Why: a 14B local model is unreliable
// at per-turn navigation (it would conclude "psychological horror" for BOTH a slasher
// and a hard-SF fan). Instead we PROBE distinct sub-genres with iconic exemplars,
// SCORE each sub-genre from the user's literal 1-5 ratings, DRILL the loved one to
// confirm it's a pattern (not a fluke), and only then hand the LLM a single job:
// name 3 real titles squarely inside the confirmed sub-genre. TMDB grounds everything.

const MIN_Q = 5;        // never finish before this many ratings
// Caps cut hard. Twelve testers averaged 54 questions and 92% said they would have closed the
// tab around question 17; one run reached 76. The full 47-term sweep was never worth its price —
// with rejected families now skipped and emphatic 5s ranked first, the taste is readable in far
// fewer questions, and the meter's <=4%/step still floors a full quiz at ~24.
// NOT a target length — a safety net. The quiz is as long as this particular person needs it to
// be: a sharp taste is settled in fifteen, a genuinely ambiguous one may take fifty, and that is
// the right outcome. What the owner is buying with those extra questions is a recommendation
// precise enough that the customer comes back.
const MAX_Q = 80;       // hard cap on RATED answers
// Films SHOWN, including "didn't see" — the real backstop so a session cannot run forever.
const SHOWN_CAP = 90;   // hard cap on TOTAL movies shown (incl "didn't see") — guarantees the
                        // quiz always terminates even for a user who's seen few films
const HI = 4;           // a rating ≥ HI is a "strong hit" toward a sub-genre
const LO = 2;           // a rating ≤ LO is a "miss" against a sub-genre
// How fast the displayed meter may climb per answer. Fifty simulated first customers were run
// through the quiz and thirty-one of them left simply because it was still going: the median
// person's patience ran out between questions 10 and 28 while the quiz averaged 30. The meter is
// what sets that length — completion needs it at 96, so a hard 4-points-per-answer ceiling
// mathematically forces 24+ questions no matter how quickly the taste is understood. The opening
// stretch, where each answer genuinely teaches the engine the most, may move 6; from question 13
// on — the confirming half, where a big move would read as a guess — it is back to 4.
const STEP_UP = (answered: number) => (answered < 13 ? 6 : 4);

const LOCK_HITS = 2;    // a loved sub-genre is CONFIRMED at this many strong hits (iconic 5★)

// Per sub-genre we track strong-hit COUNT, not just average: a noisy drill pool (TMDB's
// "slasher" keyword also returns art-horror) yields a few low ratings that would sink an
// average below threshold even when the user clearly loves the genre. Counting ≥4 hits is
// robust to that dilution — three confirmed Halloween/Friday-13th 5★ lock it regardless.
// `contra` counts CONTRADICTIONS for this sub-genre: a rating that reverses an already-
// established signal (a loved sub-genre suddenly rated low, or a rejected one rated high).
// Each contradiction lowers confidence and withholds the lock until the term is re-confirmed
// — the meter deliberately drops so the quiz lengthens in exchange for a more accurate result.
type ProbeScores = Record<string, { sum: number; n: number; hi: number; hi5?: number; lo: number; contra?: number }>;

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

// TMDB genres -> our sub-genre families, for candidates that carry no probe term (keyword-pool
// and popular-pool films). Ordered: the most defining genre wins.
const familyOfGenres = (ids?: number[]): string | undefined => {
  const g = ids || [];
  if (g.includes(27)) return 'horror';
  if (g.includes(16)) return 'animation';
  if (g.includes(35)) return 'comedy';
  if (g.includes(878)) return 'scifi';
  if (g.includes(37)) return 'western';
  if (g.includes(80) || g.includes(53) || g.includes(9648)) return 'crime';
  if (g.includes(14)) return 'fantasy';
  if (g.includes(10752) || g.includes(28)) return 'action';
  if (g.includes(18)) return 'drama';
  return undefined;
};

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
  const stats = Object.entries(probe).map(([t, { sum, n, hi, hi5, lo, contra }]) =>
    ({ t, n, hi, hi5: hi5 || 0, lo, contra: contra || 0, avg: sum / n, hiRate: hi / n }));
  const totalContra = stats.reduce((a, s) => a + s.contra, 0);
  const disliked = stats.filter(s => s.lo >= 2 && s.hi === 0).map(s => s.t);
  // The LEAD candidate: strongest signal — most strong hits, then highest average. The
  // avg tiebreak separates a true love (Arrival/Ex Machina = 5) from a cross-genre stray
  // hit (The Thing = 4).
  // FAMILY EVIDENCE breaks ties by weight of evidence rather than by which sub-genre happened
  // to be asked first. Previously several sub-genres tied at hi=1/avg=5 and the winner was
  // simply the earliest probed — a comedy lover was told they love coming-of-age drama. Now a
  // sub-genre backed by strong hits across its whole family wins the tie.
  const famHits: Record<string, number> = {};
  for (const s of stats) {
    const fam = subGenreFamily(s.t);
    if (fam) famHits[fam] = (famHits[fam] || 0) + s.hi;
  }
  const famScore = (s: { t: string }) => famHits[subGenreFamily(s.t) || ''] || 0;
  // An emphatic 5 always qualifies, whatever the average. A slasher fan who gave Halloween a 5
  // but shrugged at two other slashers sat at avg 3.0 and was filtered out entirely, so eleven
  // lukewarm 4s on neighbouring horror sub-genres won the quiz and the read came back
  // "supernatural horror". Intensity is the signal; frequency is not.
  const candidates = stats.filter(s => (s.hi >= 1 && s.avg >= 3.5) || s.hi5 >= 1)
    // Purity beats volume once intensity ties. A giallo fan and its neighbour slasher both ended
    // on one emphatic 5, and slasher won on raw hit count collected from lukewarm 4s — the wrong
    // read. Average separates them: the true love has no lukewarm ratings dragging it down.
    .sort((a, b) => b.hi5 - a.hi5 || b.avg - a.avg || b.hi - a.hi || famScore(b) - famScore(a) || b.n - a.n);
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
  // Lock when the leader is confirmed AND every CLOSE RIVAL (a contender within 1 strong hit
  // of the leader) has been drilled. We no longer require EVERY tied contender to be drilled —
  // that made a broad taste (e.g. a fan of all 11 horror sub-genres) drag on; a clearly
  // dominant leader now locks once its genuine near-rivals are settled.
  // Only the TOP TWO rivals gate the lock. A fan of a whole family (all 11 horror sub-genres
  // rated 5) turned every one of them into a contender, and requiring each to be drilled to n>=2
  // meant ~22 extra questions — which is why a "sharp" taste still ran ~46 questions instead of
  // the 15-20 the product targets. Two settled rivals already decide the race; the rest cannot
  // overtake a leader that has out-hit them.
  const rivals = leader
    ? contenders.filter(s => s.t !== leader.t && s.hi >= leader.hi - 1)
        .sort((a, b) => b.hi - a.hi || b.avg - a.avg)
        .slice(0, 2)
    : [];
  const lockedLove = (leader && leader.hi >= lockHitsNeeded && rivals.every(s => s.n >= 2)) ? leader : null;
  // "loved", for the recommendation prompt — confirmed-ish sub-genres, lead first.
  const loved = candidates.filter(s => s.hi >= 2 || s === leader);
  // REJECTED FAMILIES — the single biggest reason testers closed the tab. Rejecting a style
  // term-by-term is far too slow: a slasher fan rated mainstream blockbusters low more than ten
  // times and was still shown Home Alone 2, Ocean's Eight and Harry Potter at question 37. Once a
  // whole family has accumulated misses with no emphatic love anywhere inside it, stop asking
  // about that family entirely.
  const famAgg: Record<string, { lo: number; hi5: number; sum: number; n: number; terms: number }> = {};
  for (const st of stats) {
    const fam = subGenreFamily(st.t); if (!fam) continue;
    famAgg[fam] = famAgg[fam] || { lo: 0, hi5: 0, sum: 0, n: 0, terms: 0 };
    famAgg[fam].lo += st.lo; famAgg[fam].hi5 += st.hi5;
    famAgg[fam].sum += st.avg * st.n; famAgg[fam].n += st.n; famAgg[fam].terms++;
  }
  // Three explicit misses was too patient: by the time a family accumulated them the user had
  // already been shown several films from a style they clearly do not watch, and that screen is
  // what ends sessions. A family that two different sub-genres in has averaged below 2.2 with no
  // emphatic love anywhere inside it is cold — stop asking about it now, not three misses later.
  const rejectedFamilies = Object.entries(famAgg)
    .filter(([, v]) => v.hi5 === 0 && (v.lo >= 3 || (v.terms >= 2 && v.n >= 2 && v.sum / v.n <= 2.2)))
    .map(([f]) => f);
  return { stats, candidates, leader, contenders, loved, disliked, lockedLove, totalContra, rejectedFamilies };
}

export async function POST(req: Request) {
  try {
    // The endpoint had no limit at all: thirty concurrent finish-requests took fifty seconds each,
    // because every one of them fans out into TMDB lookups and three LLM calls, and a fresh
    // sessionId defeats every cache. A quiz is one answer every few seconds; sixty a minute is
    // already generous for a human.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';
    if (!checkRateLimit('brain:' + ip, 60, 60_000)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }
    const payload = await req.json();
    const locale = req.headers.get('x-locale') || 'he';
    // These headers come from the browser and were parsed with a bare JSON.parse: a header of
    // `not-json`, `{}` or `5` crashed the route with a 500 that echoed the exception text back to
    // the caller. Anything that is not an array of strings is simply no history.
    const idList = (raw: string | null): string[] => {
      try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; }
      catch { return []; }
    };
    const askedMovieIds: string[] = idList(req.headers.get('x-asked-ids'));
    const recentIds: string[] = idList(req.headers.get('x-recent-ids'));
    // ── WHOSE STATE IS IT. The quiz used to run entirely on what the browser sent back, and the
    //    server signed that as proof of a completed quiz — so an invented ratingHistory earned a
    //    valid token and the tokens/XP that come with it. The server now keeps its own copy of
    //    every session it serves (src/lib/brain/sessionStore.ts) and that copy wins. The client's
    //    copy is only a fallback for continuity after a cold start or a redeploy, and a session
    //    restored that way is NOT eligible to be paid for.
    const sessionKey = typeof payload.sessionId === 'string' ? payload.sessionId : '';
    const stored = payload.isInit ? startSession(sessionKey) : getSession(sessionKey);
    // Non-ASCII (Hebrew) titles can't ride HTTP headers, so taste state lives in the BODY.
    let history: BrainHistoryItem[] = stored ? stored.history
      : (Array.isArray(payload.ratingHistory) ? payload.ratingHistory : []);
    // Release years of the films they said they had not seen.
    let skipYears: number[] = stored ? stored.skipYears
      : (Array.isArray(payload.skipYears) ? payload.skipYears.filter((y: unknown) => typeof y === 'number') : []);
    const probe: ProbeScores = stored ? stored.probe
      : ((payload.probeScores && typeof payload.probeScores === 'object') ? payload.probeScores : {});
    // An answer is only an answer to a question we actually asked. Without this a client could
    // rate a movie it invented, or rate the same one repeatedly, and steer the read at will.
    if (stored && !payload.isInit && payload.movieId && !stored.served.includes(String(payload.movieId))) {
      payload.answer = undefined;
    }
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
    // A rating outside 1..5 was accepted verbatim: answer:99 wrote affinities of 48 into the
    // signed taste profile, answer:-1000 poisoned the averages. Anything else is not a rating.
    if (typeof payload.answer === 'number' && !(Number.isInteger(payload.answer) && payload.answer >= 1 && payload.answer <= 5)) {
      payload.answer = undefined;
    }
    if (!payload.isInit && payload.movieId && typeof payload.answer === 'number') {
      if (!askedMovieIds.includes(payload.movieId)) askedMovieIds.push(payload.movieId);
      history = [...history, {
        id: String(payload.movieId),
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
          // A 5 is not the same evidence as a 4. Counting them together let FREQUENCY beat
          // INTENSITY: three 4s on a style the user merely tolerates outranked a single
          // emphatic 5 on the film that defines them, so their strongest answer changed
          // nothing. hi5 tracks emphatic loves separately and leads the ranking.
          hi5: (cur.hi5 || 0) + (payload.answer >= 5 ? 1 : 0),
          lo: cur.lo + (payload.answer <= LO ? 1 : 0),
          contra,
        };
      }
    } else if (!payload.isInit && payload.movieId && typeof payload.answer !== 'number') {
      if (!askedMovieIds.includes(payload.movieId)) askedMovieIds.push(payload.movieId);
      notSeen += 1; // NOT_SEEN: no taste signal, but it IS a movie shown this session
      // WHICH films they have not seen is the one clue we get about their era. Three unseen in a
      // row is the second most common reason a simulated first customer left the quiz — a
      // 62-year-old kept getting films from the last decade, a 19-year-old films from the
      // seventies. The years round-trip so the sweep can move to the other end of the catalogue.
      const skipYear = +(String(payload.year || '').match(/\d{4}/)?.[0] || 0);
      if (skipYear) skipYears = [...skipYears, skipYear].slice(-12);
    }

    // The header is the only dedup source the client is trusted for, and it is empty after a
    // resume whose localStorage was cleared — the same film then came round twice in one quiz.
    // The rated history the body carries knows better.
    const seen = Array.from(new Set([...askedMovieIds, ...recentIds,
      ...history.map(h => String(h.id || '')).filter(Boolean)]));
    const seenSet = new Set(seen);
    const { loved, leader, contenders, disliked, lockedLove: lockedRaw, totalContra, rejectedFamilies } = computeTaste(probe);

    // ── Decide the next move DETERMINISTICALLY: EXPLORE before EXPLOIT. ──
    // EXPLORE: walk EVERY distinct sub-genre once (iconic exemplar each) before committing
    // to any one. This is what stops a cross-genre stray hit (a hard-SF fan rating "The
    // Thing" a 4) from hijacking the quiz before its true love (hard-SF) is ever shown.
    // EXPLOIT: only once the full sweep is done, DRILL the strongest explored sub-genre
    // to confirm it (LOCK_HITS strong hits). Recommend only from the confirmed sub-genre.
    const samplerAll = (await fetchSubGenreSampler(locale)).filter(c => !seenSet.has(c.id));
    // SURGICAL LOCK GATE — never crown a family's winner while its SIBLINGS are still unasked.
    // The opening sweep serves ONE blockbuster per family, so a rom-com fan who rated Elf a 4 had
    // "holiday christmas" locked at question 8 and Notting Hill was never shown; an anime fan was
    // locked onto stop-motion the same way. Every term inside the leader's family gets a first
    // look before that family's winner is declared, which is what makes the read surgical rather
    // than "whichever member we happened to ask about first".
    const familyHasUnasked = (term: string) => {
      const fam = subGenreFamily(term);
      if (!fam) return false;
      return samplerAll.some(c => {
        const st = samplerProbeOf(c.id);
        return !!st && !probe[st] && !disliked.includes(st) && subGenreFamily(st) === fam;
      });
    };
    const lockedLove = lockedRaw && !familyHasUnasked(lockedRaw.t) ? lockedRaw : null;
    // ADAPTIVE NARROWING (dynamic direction): once the opening breadth (~12 questions) has
    // revealed a clearly leading FAMILY (≥2 strong hits), stop wandering across unrelated
    // families and focus the remaining questions on that family + its adjacent ones — so each
    // answer steers the quiz toward the user's taste and it converges surgically instead of
    // sweeping all ~25 sub-genres and running to the cap.
    // Gate lowered: at hi>=2 && Q>=12 the narrowing effectively never engaged (the shortest
    // observed quiz was 54 questions while the design promises ~15-20 for a clear taste). One
    // decisive hit after the opening is already enough to bias the rest of the sweep toward that
    // family — adjacent families stay in focusFams, and the second-chance pass re-widens if the
    // focused family fails to accumulate hits, so a wrong early guess self-corrects.
    // The avg >= 4.5 gate almost never engaged: a leader built from 4s (a fan who likes the
    // family warmly rather than fanatically) sits at 4.0, so the quiz kept sweeping unrelated
    // families and served eleven consecutive films the user rated 1 — the exact stretch where
    // testers closed the tab. Two strong hits after the opening breadth is enough to commit.
    // A single strong hit is enough to commit direction once the opening breadth is done. With
    // the old two-hit gate a mecha fan whose lock had blinked off was sent back across the whole
    // sampler at question 24 and asked about Murder on the Orient Express.
    const leaderFamNow = (leader && ((leader.hi >= 2 && history.length >= 8) || (leader.hi >= 1 && history.length >= 12)))
      ? subGenreFamily(leader.t) : undefined;
    // Adjacency is insurance against a wrong early guess, so it belongs to the exploring phase
    // only. After the lock it kept the sweep wandering: an anime fan was asked about Krull and a
    // heist fan about Conan the Barbarian, nine questions after each had been read correctly.
    // The lock can blink off for a turn (a rival ties, or the leader flips to a sub-genre whose
    // siblings are unasked) and the sweep reopened with it — a locked mecha fan was asked about
    // Back to the Future at question 16. A leader with its confirming hits commits the family for
    // the SWEEP even on a turn where the lock itself is not clean.
    const lockedFam = lockedLove ? subGenreFamily(lockedLove.t)
      : (leader && leader.hi >= LOCK_HITS && history.length >= MIN_Q ? subGenreFamily(leader.t) : undefined);
    const focusFams = lockedFam ? new Set([lockedFam])
      : leaderFamNow ? new Set([leaderFamNow, ...(FAMILY_ADJ[leaderFamNow] || [])]) : null;
    // Each sub-genre used to get exactly ONE exemplar: probe it once and it was settled forever,
    // so a giallo fan who simply never connected with Suspiria had giallo written off. Terms that
    // came back AMBIGUOUS (one rating, no strong hit, not clearly rejected) get a SECOND chance
    // with their other exemplar — but only after every term has had a first look, and only inside
    // the focus families, so the quiz stays bounded.
    const ambiguous = (t: string) => { const p = probe[t]; return !!p && p.n < 2 && p.hi === 0 && p.lo < 2; };
    const firstLook: typeof samplerAll = [];
    const secondChance: typeof samplerAll = [];
    for (const c of samplerAll) {
      const t = samplerProbeOf(c.id);
      if (!t || disliked.includes(t)) continue;
      const fam = subGenreFamily(t) || '';
      if (rejectedFamilies.includes(fam)) continue; // never ask about a family they keep rejecting
      if (focusFams && !focusFams.has(fam)) continue;
      if (!probe[t]) firstLook.push(c);
      else if (ambiguous(t)) secondChance.push(c);
    }
    const uncovered = firstLook.length ? firstLook : secondChance;
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
    // n >= 2 is required: locking off a SINGLE 5-star sample let one lucky exemplar decide the
    // whole quiz, and everything the user answered afterwards was ignored.
    const earlyExploit = !!leader && leader.avg === 5 && leader.hi >= 2 && leaderFamilyExplored && history.length >= MIN_Q;
    // INTERLEAVED DRILL: the moment a sub-genre gets a strong hit, spend the NEXT question
    // confirming it instead of waiting for the whole sweep. Previously a 5 on Saving Private Ryan
    // at Q15 left searchHint empty until Q51 — the quiz felt deaf, and the confirmation that
    // shortens it arrived far too late. The sweep still resumes right after, so coverage is kept.
    const freshLead = !!leader && leader.hi >= 1 && leader.n < 2 && history.length >= 3;
    const exploitNow = sweepDone || earlyExploit || freshLead;
    // DRILL-OFF: drill the least-explored close contender first so every 5★ neighbour gets
    // its 2nd exemplar before we lock; once all are drilled, fall to the leader. Data-driven
    // tiebreak (the real love accrues more hits from its own keyword pool) instead of list
    // order. Never drill mid-sweep unless early-stop conditions hold.
    // A contender from the leader's own family is the one worth another question; drilling a
    // rival from somewhere else reads as the engine losing the thread it just found.
    const leadFamForDrill = leader ? subGenreFamily(leader.t) : undefined;
    const needDrill = contenders.filter(s => s.n < 2).sort((a, b) =>
      (subGenreFamily(a.t) === leadFamForDrill ? 0 : 1) - (subGenreFamily(b.t) === leadFamForDrill ? 0 : 1)
      || a.n - b.n || b.avg - a.avg);
    // Pre-lock: drill the least-explored close contender. Post-lock: keep drilling the LEADER
    // so the final confirmation questions (served while the meter ramps the last bit to 100%)
    // stay squarely on the user's confirmed taste — never random filler.
    // Once the taste is LOCKED the confirmed term needs no more proof. Re-asking it produced the
    // "last nine questions were all slashers I rated 5 — zero new information" complaint. The
    // remaining questions (the quiz cannot end before the meter reaches 96 at <=4%/step) are
    // spent on genuinely new ground instead: an undrilled rival first, then — via the EXPLORE
    // branch below — sub-genres never probed. That keeps every question informative AND widens
    // the loved set the recommendations are drawn from.
    // Drilling a leader whose siblings were never asked just piles more evidence onto a term
    // that may not even be the family's best fit. Explore the siblings first; the drill resumes
    // once the family is fully mapped.
    const siblingsPending = !!leader && familyHasUnasked(leader.t);
    // Post-lock the leftover contenders are drilled to widen the loved set, but a contender from
    // ANOTHER family is not a rival any more — that is how an anime fan was drilled with Friday
    // the 13th and a fantasy fan with End of Evangelion, nine questions after being read
    // correctly. Once locked, only same-family contenders are worth another question.
    const lockFamNow = lockedLove ? subGenreFamily(lockedLove.t) : undefined;
    // Once locked, the quiz needs one more confirming hit on the LEADER before it can finish
    // (see `surgical` below). Drilling rivals instead left the leader's evidence frozen, so the
    // quiz kept going with nothing left to prove and ran past fifty questions. Confirm the thing
    // we are about to recommend first; the rivals get the questions after that.
    const needsMoreProof = !!lockedLove && lockedLove.hi < LOCK_HITS + 1;
    const postLockDrill = needsMoreProof ? lockedLove
      : (needDrill.find(d => subGenreFamily(d.t) === lockFamNow) || null);
    // Pre-lock, an undrilled contender from ANOTHER family is not worth a question either: a
    // quiz already closing in on mecha anime spent question 20 on Re-Animator and World War Z.
    // With no same-family rival left, confirm the leader instead.
    const sameFamDrill = needDrill.find(d => subGenreFamily(d.t) === leadFamForDrill) || null;
    const drillTarget = (exploitNow && !siblingsPending)
      ? (lockedLove ? postLockDrill : (sameFamDrill || leader))
      : null;
    // Every pool must pass the same gate. The family ban was only applied to the EXPLORE sweep,
    // so the drill pool and the fallback pool kept serving rejected styles — a rom-com fan was
    // shown Friday the 13th at question 16 and an anime fan got Chicago at question 14. Those
    // two screens were 7 of the 8 recorded abandonments.
    // A CHILD'S TASTE IS A SAFETY SIGNAL. A persona that rated animation and family films five and
    // everything else one was asked about The Conjuring at question one and Kingsman at question
    // five, and finished with three Gundam films at "99% match". The engine has no age, but a
    // profile whose loves are the children's corner and whose rejections include horror is as
    // clear a signal as it will ever get — and the cost of being wrong is asymmetric.
    const familyLove = history.filter(h => h.rating >= HI && h.genres.includes('Family')).length;
    const scaryReject = history.filter(h => h.rating <= LO && (h.genres.includes('Horror') || h.genres.includes('Thriller'))).length;
    // One of each is enough. Waiting for two meant a child was shown The Ring at question two,
    // and there is no upside to being slow about this: an adult who happens to love a family film
    // and dislike one thriller loses nothing but a few horror questions.
    const kidsMode = familyLove >= 1 && scaryReject >= 1
      && !history.some(h => h.rating >= HI && h.genres.includes('Horror'));
    const unsafeForKids = (c: { id: string; _genreIds?: number[] }) => {
      if (!kidsMode) return false;
      const t = samplerProbeOf(c.id);
      if (t && (subGenreFamily(t) === 'horror' || t === 'erotic thriller')) return true;
      const g = c._genreIds || [];
      return g.includes(27) || g.includes(53) || g.includes(80);
    };

    const rejectsUser = (c: { id: string; _genreIds?: number[] }) => {
      if (unsafeForKids(c)) return true;
      const t = samplerProbeOf(c.id);
      const fam = t ? subGenreFamily(t) : undefined;
      if (fam && rejectedFamilies.includes(fam)) return true;
      if (t && disliked.includes(t)) return true;
      const st = t ? probe[t] : undefined;         // a term they already rated low needs no re-ask
      if (st && st.n >= 1 && st.sum / st.n <= 2 && !st.hi) return true;
      // A keyword-pool film carries no probe term at all, and TMDB keyword search is noisy —
      // "hand-drawn anime" returned a Greek murder mystery, which is exactly the kind of screen
      // that ends a session after the taste is already read. Judge those by their genres.
      const locked = lockedLove ? subGenreFamily(lockedLove.t) : undefined;
      // A curated exemplar belongs to its TERM's family, whatever TMDB tagged it. King Kong is a
      // creature feature but carries the Action genre, so a genre-only check let it through to
      // three different locked users; 12 Angry Men (courtroom) reached locked drama fans the same
      // way. Judge a termed candidate by its term.
      if (locked && fam && fam !== locked) return true;
      const fam2 = familyOfGenres(c._genreIds);
      if (fam2 && rejectedFamilies.includes(fam2)) return true;
      // A film with no curated term is judged by the company it keeps: if every sub-genre of its
      // genre-family that the user has rated came back cold, so is it. Seen live — a noir fan who
      // gave Spider-Man a 1 was handed The Amazing Spider-Man six questions later, because one
      // rejected term is not enough to write off a whole family but is plenty to skip its
      // untagged neighbours.
      if (fam2) {
        const kin = Object.entries(probe).filter(([t]) => subGenreFamily(t) === fam2);
        // Two cold sub-genres, not one: a single low rating inside a family is an opinion about
        // that film, and blocking the family's untagged neighbours off it cost accuracy.
        if (kin.length >= 2 && kin.every(([, v]) => !v.hi && v.sum / v.n <= 2)) return true;
      }
      if (locked && !fam && fam2 && fam2 !== locked) return true;
      return false;
    };
    let pool: Awaited<ReturnType<typeof fetchCandidatePool>>;
    let nextHint = '';
    // Which branch produced this question. Returned on the response so a QA run can attribute an
    // off-taste screen to the pool that served it instead of guessing.
    let poolSrc = '';
    if (drillTarget) {
      // EXPLOIT — confirm with the target sub-genre's 2nd CURATED iconic exemplar first
      // (a reliable, recognizable test), falling back to the keyword pool. The keyword
      // pool alone is noisy (TMDB "slasher" also returns torture-porn the user rejects),
      // which would dilute the signal and prevent a clean lock.
      const curated = samplerAll.filter(c => samplerProbeOf(c.id) === drillTarget.t);
      // Curated exemplars alone are a FIXED playlist — two sessions replayed the same horror
      // block in the same order ("I knew Re-Animator was next"). Blend in the keyword pool and
      // shuffle per session so the confirm phase differs between quizzes while staying on-term.
      const byHint = await fetchPoolByHint(drillTarget.t, seen, locale, 10);
      const drilled = [...curated, ...byHint]
        .filter(c => !rejectsUser(c))
        .filter((c, i, a) => a.findIndex(x => x.id === c.id) === i)
        .sort((a, b) => seededRank(sessionId + a.id) - seededRank(sessionId + b.id));
      // Falling back to the raw sampler here reopened every family: a locked anime fan was still
      // handed Krull. If the drill has nothing left, keep the pool on-taste and let the caller's
      // gate pick from what survives.
      // Reopening the whole sampler here handed a mecha fan The Avengers at question 28. Stay
      // inside the drilled sub-genre's own family when the drill itself has nothing left.
      const drillFam = subGenreFamily(drillTarget.t);
      const safeSampler = samplerAll.filter(c => !rejectsUser(c));
      const sameFam = drillFam
        ? safeSampler.filter(c => subGenreFamily(samplerProbeOf(c.id) || '') === drillFam) : [];
      pool = drilled.length ? drilled : sameFam.length ? sameFam : safeSampler;
      nextHint = drillTarget.t;
      poolSrc = 'drill';
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
      const leadFam = leader ? subGenreFamily(leader.t) : undefined;
      const inLeadFam = (c: { id: string }) =>
        leadFam && subGenreFamily(samplerProbeOf(c.id) || '') === leadFam ? 0 : 1;
      // BOREDOM. Fifty simulated first customers were run through the quiz and ten of them left
      // between questions 5 and 9 — not because anything was broken, but because the sweep serves
      // one blockbuster per family and a niche viewer therefore sits through a run of films they
      // do not care about before anything speaks to them. After two low answers in a row, prefer
      // a family they have not already rejected.
      const coldFams = new Set<string>();
      for (const [t, v] of Object.entries(probe)) {
        const f = subGenreFamily(t); if (f && !v.hi && v.sum / v.n <= 2) coldFams.add(f);
      }
      const lowRun = (() => { let k = 0; for (let i = history.length - 1; i >= 0; i--) { if (history[i].rating <= 2) k++; else break; } return k; })();
      const boredomPenalty = (c: { id: string }) => {
        if (lowRun < 2) return 0;
        const f = subGenreFamily(samplerProbeOf(c.id) || '');
        return f && coldFams.has(f) ? 1 : 0;
      };
      // ERA. A 62-year-old answered "didn't see" three times in a row on recent blockbusters and
      // left; a 19-year-old did the same on films from the seventies. Two skips in one direction
      // are enough to stop serving that end of the catalogue.
      const recentSkips = skipYears.filter(y => y >= 2010).length;
      const oldSkips = skipYears.filter(y => y && y < 1995).length;
      const eraPenalty = (c: { id?: string; year?: string }) => {
        const y = +(c.year || 0); if (!y) return 0;
        if (recentSkips >= 2 && oldSkips === 0 && y >= 2015) return 1;
        if (oldSkips >= 2 && recentSkips === 0 && y < 1990) return 1;
        return 0;
      };
      const nextUp = [...uncovered].sort((a, b) =>
        (inLeadFam(a) - inLeadFam(b)) ||
        (boredomPenalty(a) - boredomPenalty(b)) ||
        (eraPenalty(a) - eraPenalty(b)) ||
        (samplerTier(a.id) - samplerTier(b.id)) ||
        (seededRank(sessionId + a.id) - seededRank(sessionId + b.id)));
      // Take the first candidate that survives the taste gate rather than the first candidate
      // outright: when the head of the queue is off-taste, dropping the whole turn skipped that
      // sub-genre's only first look and the read came back one niche off.
      pool = [nextUp.find(c => !rejectsUser(c)) || nextUp[0]];
      poolSrc = 'sweep';
      nextHint = ''; // sampler movies carry their own term via samplerProbeMap
    } else {
      // POST-SWEEP: every remaining question belongs to the taste we have already found. The
      // sources are tried in order of how surely they are still "the right shelf", and each one
      // passes the same rejection gate. Earlier versions fell through to whatever TMDB was
      // trending and handed locked users Poltergeist, Krull, Jackass Number Two, Power Rangers
      // and Out of Africa — long after their taste had been read correctly.
      const focusTerm = lockedLove?.t || leader?.t;
      const focusFam = focusTerm ? subGenreFamily(focusTerm) : undefined;
      const gate = <T extends { id: string; _genreIds?: number[] }>(list: T[]): T[] =>
        list.filter(c => !seenSet.has(c.id) && !rejectsUser(c));
      const famOf = (c: { id: string }) => subGenreFamily(samplerProbeOf(c.id) || '');
      // Least-covered sub-genre first: the sampler holds eight war blockbusters, and without this
      // a heist fan spent the last eight questions rating war films.
      const cover = (c: { id: string }) => { const t = samplerProbeOf(c.id); return t && probe[t] ? probe[t].n : 0; };
      const byCover = (list: typeof samplerAll) => [...list].sort((a, b) => cover(a) - cover(b));

      const tiers: [string, () => Promise<typeof samplerAll>][] = [
        // 1. Unasked curated exemplars inside the focus family.
        ['inFam', async () => byCover(gate(samplerAll).filter(c => focusFam && famOf(c) === focusFam))],
        // 2. The focus sub-genre's own canonical films.
        ['seeds', async () => focusTerm ? gate(await fetchSeedCandidates(focusTerm, seen, 8)) : []],
        // 3. Its sibling sub-genres — same family, still the right shelf.
        ['kinSeeds', async () => {
          if (!focusFam) return [];
          let out: typeof samplerAll = [];
          for (const t of allSubGenreTerms()) {
            if (out.length >= 8) break;
            if (t === focusTerm || subGenreFamily(t) !== focusFam || disliked.includes(t)) continue;
            out = out.concat(gate(await fetchSeedCandidates(t, seen, 4)));
          }
          return out;
        }],
        // 4. Keyword search on the focus term — noisiest, hence gated and late.
        ['wide', async () => focusTerm ? gate(await fetchPoolByHint(focusTerm, seen, locale, 20)) : []],
        // 5. An adjacent family's canonical films. A two-term family (fantasy) genuinely runs dry
        //    around question 34, and a deliberate neighbour beats anything trending.
        ['adjSeeds', async () => {
          if (!focusFam) return [];
          let out: typeof samplerAll = [];
          for (const t of allSubGenreTerms()) {
            if (out.length >= 8) break;
            const f = subGenreFamily(t);
            if (!f || !(FAMILY_ADJ[focusFam] || []).includes(f) || disliked.includes(t)) continue;
            out = out.concat(gate(await fetchSeedCandidates(t, seen, 4)));
          }
          return out;
        }],
        // 6. The family's whole TMDB shelf. Curated lists are finite — a one-term family
        //    (western) empties by question 22 — and this keeps every remaining question inside
        //    the taste instead of falling through to what happens to be trending.
        ['famPool', async () => focusFam ? gate(await fetchFamilyPool(focusFam, seen, locale, 12)) : []],
        // 7. Anything curated that still passes the gate, then the popular pool as the last resort.
        ['anySampler', async () => byCover(gate(samplerAll))],
        ['popular', async () => gate(await fetchCandidatePool(seen, locale, 12))],
      ];
      pool = [];
      for (const [name, get] of tiers) {
        const got = await get();
        if (got.length) { pool = got; poolSrc = 'post-' + name; break; }
      }
      if (!pool.length) { pool = await fetchCandidatePool(seen, locale, 12); poolSrc = 'post-ungated'; }
    }
    { const safe = (pool || []).filter(c => !rejectsUser(c)); if (safe.length) pool = safe; }


    const baseState = {
      sessionId, historyCount: history.length, ratedCount: history.length,
      askedMovieIds, userAffinities: {}, ratingHistory: history, probeScores: probe, engine: 'brain',
      notSeen, // session-scoped "didn't see" count, round-trips so the shown-cap stays per-quiz
      skipYears, // release years of the skipped films — steers the sweep toward their era
    };

    // ── Honest progress: confidence reflects genuine sub-genre understanding, not click
    //    count. It climbs only as a loved sub-genre accumulates confirming ratings. ──
    // Honest progress blends sweep coverage with lock confirmation, so the meter reflects
    // real understanding, not click count.
    // Smooth, honest meter: three continuous components so it climbs GRADUALLY (no long
    // plateau then a jump). (a) sweep coverage, (b) rated-count progress — keeps inching up
    // as the user answers, (c) leader strength as a CONTINUOUS value (hits + how far the avg
    // sits above neutral), not a binary lock. A real lock pins it to ~1.
    // TRUE sweep coverage (probed vs. probed+remaining) instead of a fixed /12 denominator that
    // saturated after 12 terms and then contributed nothing for the rest of the quiz.
    const probedCount = Object.keys(probe).length;
    const sweepProgress = probedCount / Math.max(1, probedCount + uncovered.length);
    // Rated progress is measured against the real ceiling (MAX_Q), not 24 — at /24 it saturated
    // a third of the way in and stopped moving the meter.
    const ratedProgress = Math.min(1, history.length / MAX_Q);
    // CONTINUOUS lock-proximity so the meter RAMPS smoothly toward 100 instead of completing
    // at ~75% and jumping. It blends: how many of the needed confirming hits the leader has,
    // how many close contenders are already drilled (the drill-off progress), and how
    // decisive the leader's average is. Reaches ~0.97 just as the lock conditions are met,
    // so the final step to a locked 100% is small and natural.
    const need = LOCK_HITS + (leader?.contra || 0);
    const hitProg = leader ? Math.min(1, leader.hi / need) : 0;
    // Counting only FULLY drilled contenders made this jump backwards the moment a new contender
    // appeared (denominator +1, numerator +0), producing a 12-point meter drop around Q47 for
    // users who had contradicted nothing. Weighting by accumulated evidence keeps it smooth.
    const drilledEvidence = contenders.reduce((a, s) => a + Math.min(s.n, 2), 0);
    const drillProg = contenders.length ? drilledEvidence / (2 * contenders.length) : 1;
    const leaderStrength = lockedLove ? 1 : (leader ? Math.min(0.97, 0.5 * hitProg + 0.3 * drillProg + 0.2 * (Math.max(0, leader.avg - 3) / 2)) : 0);
    // Each unresolved contradiction PULLS THE METER DOWN (0.15 apiece, capped) — the user
    // sees the percentage drop after a taste-reversing answer, signalling the engine is
    // re-checking rather than racing to a guess. Floored so it never reads as total reset.
    const contraPenalty = Math.min(0.5, (totalContra || 0) * 0.15);
    // A slow monotonic "creep" so the meter never sits perfectly flat during a long drill-off
    // (a broad taste with many tied contenders) — it keeps inching up as the user answers.
    const creep = Math.min(1, history.length / 50);
    // Small creep weight so it gives gentle forward motion WITHOUT masking a real DROP when an
    // answer adds uncertainty (a leader contradiction lowers leaderStrength + contraPenalty).
    const blended = Math.min(0.99, 0.28 * sweepProgress + 0.28 * ratedProgress + 0.41 * leaderStrength + 0.03 * creep);
    // A CONFIRMED lock is genuine high confidence — the leader out-hit its rivals and they were
    // drilled. Holding the blend low after that (sweep coverage is still partial by design once
    // narrowing engages) forced ~14 extra questions of pure ramp before the 96 gate, which is why
    // a sharp taste still ran ~36-46 questions instead of the 15-20 the product targets. The
    // ≤4%/step clamp still applies, so the meter climbs to it smoothly rather than jumping.
    const confidence = Math.max(0.05, (lockedLove ? Math.max(blended, 0.88) : blended) - contraPenalty);

    // DISPLAY METER: ease the SHOWN percent toward the true confidence by at most 4 points per
    // answer (owner wants smooth 1-4% steps, never a 5→42 jump). The previous shown value
    // round-trips via the x-current-confidence header. Completion is gated on the SHOWN meter
    // (below), so the final step to 100 is also ≤4.
    const prevShown = Math.round((parseFloat(req.headers.get('x-current-confidence') || '0') || 0) * 100);

    // ── Completion intent: the engine WANTS to finish once the taste is locked (after MIN_Q),
    //    or a hard cap is reached. Two caps: MAX_Q on RATED answers, and a TOTAL-SHOWN cap on
    //    movies presented (incl. "didn't see") so the quiz ALWAYS terminates. ──
    // The caps must actually bound the quiz. Completion needs the DISPLAYED meter at 96 and the
    // meter only moves ≤4/step, so finishing has to START a few questions BEFORE the cap —
    // otherwise the quiz ran ~23 questions past SHOWN_CAP purely to let the meter catch up.
    // CLOSING_WINDOW reserves exactly enough steps (8 × 4 = 32 points) for that ramp, so the
    // quiz ends AT the cap rather than long after it.
    // A FIXED closing window was still wrong: with the meter low (e.g. a user who skips almost
    // everything and sits at 5%) the ramp needed far more than 8 steps, so the quiz ran to 90
    // questions against a SHOWN_CAP of 75, and MAX_Q was overshot in most runs. Size the window
    // from the REAL gap instead — begin closing exactly when the remaining budget equals the
    // number of 4-point steps still needed to reach 96. The caps are then authoritative: the
    // quiz ends AT the cap, never past it.
    const shownCount = history.length + notSeen; // session-scoped, not cross-quiz
    const budgetLeft = Math.min(MAX_Q - history.length, SHOWN_CAP - shownCount);
    const stepsNeeded = Math.max(0, Math.ceil((96 - prevShown) / 6));
    const mustFinish = budgetLeft <= stepsNeeded;
    // The user can stop the quiz whenever they like ("enough, recommend now"). This is an
    // explicit request, so it finishes on THIS response with the best signal gathered — no
    // closing ramp, because a jump the user asked for is not a surprise.
    const userAsked = payload.finishNow === true && history.length >= MIN_Q;
    // SURGICAL CERTAINTY, not a question count. Finishing on the bare lock ended quizzes while
    // the read was merely probable — one more confirming hit and no unresolved contradiction is
    // what separates "we think it's slasher" from "we know it's slasher", and that difference is
    // the whole product: the customer only comes back if the three films were exactly right.
    // A contradiction anywhere in the quiz used to block finishing outright, and since it never
    // decays the quiz then ran to the safety cap. It should cost EVIDENCE, not stall: each
    // reversal on the leader demands one more confirming hit before we are willing to say we know.
    const surgical = !!lockedLove && lockedLove.hi >= LOCK_HITS + 1 + (lockedLove.contra || 0);
    const wantFinish = userAsked || mustFinish || (history.length >= MIN_Q && surgical);

    // DISPLAY METER: during normal play the target IS the raw confidence, so the meter moves
    // freely UP *and DOWN* (≤4 points per answer) — a taste-reversing / uncertain answer drops
    // it 1–4%, a confirming one lifts it 1–4%. Only when the engine wants to FINISH do we raise
    // the target to ~99, so the meter eases up the last stretch and we complete ONLY once it has
    // reached 96 — the final step to 100 is then ≤4, never a jump. prevShown round-trips via the
    // x-current-confidence header.
    const target = Math.round(Math.min(0.99, wantFinish ? Math.max(confidence, 0.99) : confidence) * 100);
    let shown: number;
    // A skip is MCAR — it carries no taste signal, so it must never advance the closing ramp.
    // It previously did: testers watched the tail march 88→92→96→100 while answering NOT_SEEN.
    const rampBlocked = wantFinish && !payload.isInit && !!payload.movieId && typeof payload.answer !== 'number';
    // Once the read is confirmed the remaining questions exist only to walk the meter up to 96.
    // Holding those to four points each added eight questions of pure ramp to every quiz — the
    // shortest run against fifty simulated customers was still 21 questions for a taste the
    // engine had settled by question 8. The closing stretch moves at the opening rate.
    const step = wantFinish ? 6 : STEP_UP(history.length);
    if (prevShown <= 0) shown = Math.min(target, 6);                          // first question: gentle start
    else if (rampBlocked) shown = prevShown;
    else if (target > prevShown) shown = Math.min(target, prevShown + step);  // rise, smoothly
    else if (target < prevShown) shown = Math.max(target, prevShown - 4);     // fall ≤ 4 (uncertainty)
    else shown = prevShown;
    // MINIMUM MOVEMENT: the spec is 1-4% EVERY step. Whenever the taste model barely changes
    // (a long drill-off, or a mid-sweep stretch where each new term is probed only once) the
    // target could sit still for 15-25 answers and the meter looked frozen. If the user actually
    // rated something and nothing pulled the meter down, nudge it one point. Capped at 95 so it
    // can never reach the completion threshold on its own — only real confidence finishes a quiz.
    const ratedThisTurn = !payload.isInit && typeof payload.answer === 'number';
    const skippedThisTurn = !payload.isInit && !!payload.movieId && typeof payload.answer !== 'number';
    if (ratedThisTurn && shown === prevShown && !wantFinish && shown < 95) shown = prevShown + 1;
    // A skip carries no TASTE signal, but it does consume the quiz budget — leaving the bar
    // pinned at 5% for 67 consecutive skips read as broken. Advance it at half rate so the user
    // sees the quiz progressing without the engine claiming knowledge it does not have.
    else if (skippedThisTurn && shown === prevShown && !wantFinish && shown < 95 && notSeen % 2 === 0) shown = prevShown + 1;

    // Complete only once the ALREADY-DISPLAYED meter (prevShown) has reached 96 — so the final
    // visible step is 96→100 (≤4), never e.g. 92→100. The meter shows 96 on one question, then
    // the next response is the recommendations at 100.
    // Finishing early on exhaustion produced exactly the jump this meter exists to prevent: a
    // real browser run ended 82% -> 100% in one step and then claimed 99% accuracy. Now that every
    // fallback pool is on-taste, running out of material is rare enough that the honest ramp is
    // affordable; exhaustion only tells the meter to keep climbing, never to skip ahead.
    // A user who answers "didn't see" to everything froze the ramp (a skip carries no signal, so
    // it must not advance it) and the quiz never ended — 400 skips in a row still returned a
    // question. The cap on films SHOWN is authoritative regardless of where the meter sits.
    const done = userAsked || (wantFinish && (prevShown >= 96 || shownCount >= SHOWN_CAP));

    if (!done) {
      // Serve the next question — always a real pool movie. A SINGLE failed detail fetch must
      // never end the quiz: previously one null from movieById (TMDB hiccup, 429, or a title
      // with no poster) fell straight through to the DONE block below, so the user saw the meter
      // jump from wherever it was to 100% + recommendations mid-quiz. Try several candidates,
      // then refill from the popular pool, and only give up if TMDB is truly unreachable.
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      let movie: Awaited<ReturnType<typeof movieById>> = null;
      // A film with no Hebrew synopsis renders as a bare title over a poster — seen live on Rudy,
      // where the card had nothing to read. Prefer a candidate that has one; only fall back to a
      // synopsis-less film if nothing else is left.
      let bare: Awaited<ReturnType<typeof movieById>> = null;
      for (const cand of shuffled.slice(0, 6)) {
        const m = await movieById(cand.id, locale);
        if (!m) continue;
        if (m.overview && m.overview.trim()) { movie = m; break; }
        bare = bare || m;
      }
      movie = movie || bare;
      if (!movie) {
        for (const cand of await fetchCandidatePool(seen, locale, 10)) {
          movie = await movieById(cand.id, locale);
          if (movie) break;
        }
      }
      if (movie) {
        // Remember what we asked, so the next request can be checked against it.
        if (stored) {
          stored.served = [...stored.served, movie.id].slice(-200);
          stored.history = history; stored.probe = probe; stored.notSeen = notSeen;
          stored.skipYears = skipYears; stored.shown = shown;
          saveSession(sessionKey, stored);
        }
        movie.trailerId = await getTrailer(movie.id);
        const tasteSummary = lockedLove ? `Confirming: ${lockedLove.t}` : leader ? `Closing in on: ${leader.t}` : 'Mapping your taste…';
        return NextResponse.json({
          ...baseState, tasteSummary, searchHint: nextHint, poolSrc,
          isComplete: false, confidenceScore: shown / 100, progressPercent: Math.min(99, shown),
          currentVectorState: { possibleMoviesRemaining: Math.max(2, Math.round(50000 * (1 - shown / 100))), leadingMicroGenres: [tasteSummary] },
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
    type Rec = NonNullable<Awaited<ReturnType<typeof movieById>>>;
    const resolved: Rec[] = [];

    // ── DISLIKE GUARD: never recommend a film the user rated low, nor a film whose genre
    //    profile is one they clearly rejected (e.g. a 1★ on Star Wars → no space-opera/sci-fi
    //    pick, and never that film itself). A genre that was BOTH liked and disliked is
    //    ambiguous, so it's allowed — only purely-rejected genres are filtered out.
    const lovedGenres = new Set<string>();
    const hatedGenres = new Set<string>();
    const hatedIds = new Set<string>();
    // Counts, not flags: a genre that appears once in a loved film and eight times in rejected
    // ones is not ambiguous, it is rejected.
    const lovedGenreHits: Record<string, number> = {};
    const hatedGenreHits: Record<string, number> = {};
    for (const h of history) {
      if (h.rating >= HI) h.genres.forEach(g => { lovedGenres.add(g); lovedGenreHits[g] = (lovedGenreHits[g] || 0) + 1; });
      if (h.rating <= LO) { if (h.id) hatedIds.add(h.id); h.genres.forEach(g => { hatedGenres.add(g); hatedGenreHits[g] = (hatedGenreHits[g] || 0) + 1; }); }
    }
    // A single horror-comedy rated 5 deleted Horror from the hated set entirely, and a comedy fan
    // who had rated every horror film 1 was then recommended Horror. A genre only stops counting
    // as hated when it is loved MORE often than it is rejected.
    for (const g of lovedGenres) {
      if ((lovedGenreHits[g] || 0) > (hatedGenreHits[g] || 0)) hatedGenres.delete(g);
    }
    // Per-genre filtering SELF-CANCELS for a franchise: someone who hates Marvel but likes Action
    // clears "Action" from hatedGenres, so Guardians of the Galaxy slipped through. So also record
    // the full genre COMBINATION of each rejected film — a candidate carrying every genre of a
    // rejected combination is the same kind of film, even if one of those genres is liked alone.
    const hatedCombos = history
      .filter(h => h.rating <= LO && h.genres.length >= 2)
      .map(h => h.genres);
    // Sequels/spin-offs of a rejected film share distinctive title words ("Guardians", "Avengers",
    // "Star Wars") — cheap, API-free franchise detection.
    const STOP = new Set(['the', 'and', 'of', 'a', 'an', 'part', 'vol', 'movie', 'ה', 'של', 'את']);
    const tokens = (t: string) => t.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4 && !STOP.has(w));
    const hatedTokens = new Set(history.filter(h => h.rating <= LO).flatMap(h => tokens(h.title)));
    // `onTaste` = the candidate came from the user's OWN confirmed/loved sub-genre seeds. The
    // combo rule exists to stop franchise leakage ACROSS families (hating Marvel while liking
    // Action), but it also fired on the very user this engine is built for: someone who loves one
    // niche inside a genre they otherwise dislike (loves giallo, rates mainstream horror low) had
    // their own locked niche filtered out and replaced with off-taste filler. Their confirmed
    // sub-genre is exempt from the combo test — an explicit low rating on the film itself, or on
    // its franchise, still blocks it.
    const isBad = (m: Rec, onTaste = false) => {
      if (askedMovieIds.includes(m.id) || hatedIds.has(m.id)) return true;
      if (tokens(m.title).some(w => hatedTokens.has(w))) return true;
      const names = genreNames(m._genreIds || []);
      if (onTaste) return false;
      if (names.length > 0 && names.some(n => hatedGenres.has(n)) && !names.some(n => lovedGenres.has(n))) return true;
      // The same safety signal applies to what we finally recommend, not only to what we ask.
      if (kidsMode && (names.includes('Horror') || names.includes('Thriller') || names.includes('Crime'))) return true;
      // "Animation" covers both Toy Story and The End of Evangelion, and a child's profile was
      // answered with three Gundam films at "99% match". In kids mode a pick has to carry the
      // Family genre — the one label that separates the children's shelf from adult anime.
      if (kidsMode && !names.includes('Family')) return true;
      if (hatedCombos.some(combo => combo.every(g => names.includes(g)))) return true;
      return false;
    };
    const add = (m: Rec | null) => { if (m && !resolved.some(x => x.id === m.id) && !isBad(m)) resolved.push(m); };

    // Build the LOVED candidate pool: curated seeds from the confirmed term + any OTHER loved
    // sub-genre (never a disliked term, never a generic popular pool — that's what leaked a
    // hated style like Guardians before). Every candidate is a real, on-taste film.
    const dislikedSet = new Set(disliked);
    const lovedTerms = [confirmedTerm, ...loved.map(s => s.t)]
      .filter((t, i, a) => !!t && !dislikedSet.has(t) && a.indexOf(t) === i);
    const candPool: Rec[] = [];
    // Which sub-genre each candidate actually came from. The reason used to name the CONFIRMED
    // term for all three picks, so a horror fan whose confirmed term was "zombie" was told that
    // Sleepaway Camp (a slasher) and The Conjuring 2 would appeal to their love of zombie films.
    const termOfPick = new Map<string, string>();
    // DISCOVERY. A genre expert who rated Profondo Rosso 5 was handed Halloween, Scream and
    // Friday the 13th — films she certainly already owns. The curated seed lists are ordered
    // canon-first, so the three most obvious titles always won. Skip the two most canonical
    // entries per term once the user has demonstrated real depth (an emphatic 5 in that term),
    // so an expert gets the deeper cut and a newcomer still gets the classics.
    const depthOf = (term: string) => (probe[term]?.hi5 || 0) >= 1 ? 2 : 0;
    for (const term of lovedTerms) {
      if (candPool.length >= 12) break;
      // askedMovieIds only covers THIS quiz, so a returning customer with the same taste got the
      // same three films back — visit 3 of a slasher fan repeated two of visit 2's picks. `seen`
      // carries the cross-quiz window (x-recent-ids) as well, which is what makes the second
      // visit feel like the engine remembers them.
      const seeds = await recommendBySubGenre(term, seen, locale, 8);
      for (const m of seeds.slice(depthOf(term))) {
        if (candPool.length >= 12) break;
        if (!candPool.some(x => x.id === m.id) && !isBad(m, true)) { candPool.push(m); termOfPick.set(m.id, term); }
      }
    }
    // AI TASTE DIRECTOR (gemma2): picks the final 3 FROM the real candidate pool, steered by
    // the user's actual loved/hated FILMS — so it rejects a hated franchise/studio/style the
    // coarse genre filter can't (e.g. "hated Marvel/DC → never Guardians of the Galaxy").
    // Grounded (chooses only from the supplied list, no hallucination); null → deterministic.
    const lovedTitles = history.filter(h => h.rating >= HI).map(h => h.title);
    const hatedTitles = history.filter(h => h.rating <= LO).map(h => h.title);
    const byTitle = new Map(candPool.map(m => [m.title, m] as const));
    const directed = await directRecs({ candidates: candPool.map(m => m.title), lovedTitles, hatedTitles, term: confirmedTerm || 'this taste', mock });
    if (directed) for (const t of directed) { if (resolved.length >= 3) break; add(byTitle.get(t) || null); }
    // deterministic order of the same safe pool if the director under-filled.
    for (const m of candPool) { if (resolved.length >= 3) break; add(m); }
    // The family's TMDB shelf. A one-term family (western) can have every curated seed used up
    // AS A QUESTION by the time the quiz ends — a western fan reached the results screen with
    // zero recommendations on it, which is the worst possible ending. This shelf is effectively
    // unlimited and still squarely on-taste.
    if (resolved.length < 3 && confirmedTerm) {
      const fam = subGenreFamily(confirmedTerm);
      if (fam) for (const c of await fetchFamilyPool(fam, seen, locale, 16)) {
        if (resolved.length >= 3) break;
        const m = await movieById(c.id, locale);
        if (m && !isBad(m, true)) add(m);
      }
    }
    // keyword pool on the confirmed term (still squarely on-taste).
    if (resolved.length < 3 && confirmedTerm) {
      for (const c of await fetchPoolByHint(confirmedTerm, seen, locale, 16)) { if (resolved.length >= 3) break; add(await movieById(c.id, locale)); }
    }
    // Guarantee 3 recs WITHOUT ever leaking a rejected style: a popular film must share a
    // LOVED genre (and pass the dislike filter). Only if the taste was too thin to have any
    // loved genre do we allow any non-hated popular film.
    if (resolved.length < 3) {
      for (const c of await fetchCandidatePool(seen, locale, 40)) {
        if (resolved.length >= 3) break;
        const m = await movieById(c.id, locale);
        if (!m || resolved.some(x => x.id === m.id) || isBad(m)) continue;
        const names = genreNames(m._genreIds || []);
        if (lovedGenres.size === 0 || names.some(n => lovedGenres.has(n))) resolved.push(m);
      }
    }
    // ABSOLUTE last resort. The old version dropped the genre guard entirely to guarantee three
    // picks, which is exactly how a purely-rejected style reached the final list. Relax on a
    // HARMLESS axis instead: re-offer a curated on-taste film the user was already shown (as long
    // as they did not rate it low). Novelty is sacrificed, never taste.
    if (resolved.length < 3 && lovedTerms.length) {
      for (const term of lovedTerms) {
        if (resolved.length >= 3) break;
        for (const m of await recommendBySubGenre(term, [], locale, 8)) {
          if (resolved.length >= 3) break;
          if (isBad(m, true) || resolved.some(x => x.id === m.id)) continue;
          resolved.push(m);
        }
      }
    }
    // Only when the user expressed NO likes at all (nothing to be on-taste with) do we reach for
    // popular films — and even then the rejection filters still apply.
    if (resolved.length < 3) {
      for (const c of await fetchCandidatePool(seen, locale, 40)) {
        if (resolved.length >= 3) break;
        const m = await movieById(c.id, locale);
        if (!m || resolved.some(x => x.id === m.id) || hatedIds.has(m.id)) continue;
        const names = genreNames(m._genreIds || []);
        if (names.some(n => hatedGenres.has(n)) && !names.some(n => lovedGenres.has(n))) continue;
        if (hatedCombos.some(combo => combo.every(g => names.includes(g)))) continue;
        resolved.push(m);
      }
    }

    // A user who dislikes nearly everything ends with every genre in the hated set, so each
    // guarded tier above rejects its whole pool and the results screen came back EMPTY after a
    // 34-question quiz — seen in a browser run. Three well-reviewed films they never rated low
    // is a poor read but an honest one; an empty screen is neither.
    if (resolved.length < 3) {
      for (const c of await fetchCandidatePool(seen, locale, 40)) {
        if (resolved.length >= 3) break;
        const m = await movieById(c.id, locale);
        if (m && !hatedIds.has(m.id) && !resolved.some(x => x.id === m.id)) resolved.push(m);
      }
    }

    // A TMDB blip can leave every source above empty, which showed an empty results screen at
    // the end of a long quiz. One short retry against the curated seeds (title lookups are
    // week-cached, so this usually succeeds even mid-outage) before we give up.
    if (!resolved.length) {
      await new Promise(r => setTimeout(r, 400));
      for (const term of (lovedTerms.length ? lovedTerms : [confirmedTerm].filter(Boolean))) {
        if (resolved.length >= 3) break;
        for (const m of await recommendBySubGenre(term, [], locale, 5)) {
          if (resolved.length >= 3) break;
          if (!resolved.some(x => x.id === m.id) && !hatedIds.has(m.id)) resolved.push(m);
        }
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
    // Availability is fetched alongside the reasons — a rec the user cannot act on tonight is
    // not a recommendation. Region is IL; a miss just omits the row.
    const watch = await Promise.all(picks.map(p => getWatchProviders(p.id, 'IL')));
    const reasons = await Promise.all(picks.map(p =>
      recReason({ title: p.title, year: yearOf(p), term: termOfPick.get(p.id) || confirmedTerm || (locale === 'en' ? 'this style' : 'הסגנון שלך'), locale, mock, genres: genreNames(p._genreIds || []), overview: p.overview })));

    const finalMovies = picks.map((p, i) => ({
      id: `res_${p.id}`, title: p.title,
      // A hardcoded 99% sat next to a 60% meter on the same screen for a user the engine had not
      // understood. The badge now says what the engine actually believes.
      matchScore: Math.max(60, Math.round((lockedLove ? 99 : Math.min(95, confidence * 100)) - i * 4)),
      posterUrl: p.posterUrl, trailerId: p.trailerId, overview: p.overview,
      _genreIds: p._genreIds,
      reason: reasons[i] || (confirmedTerm ? `A canonical ${confirmedTerm} pick` : ''),
      watch: watch[i] || null, // where to actually watch it in Israel
    }));

    // ── PERSIST THE TASTE ────────────────────────────────────────────────────────────────
    // The brain never issued a proofToken, so /api/user/bootstrap rejected every brain quiz with
    // 403 and NO profile was ever written — the returning-customer half of the product simply did
    // not exist. Emit the same signed proof the formula engine does, but carry the SUB-GENRE
    // vector (what this engine actually knows) instead of broad genre affinities, so a saved
    // profile can drive later recommendations without re-running the quiz.
    const subGenreVector: Record<string, number> = {};
    for (const [term, p] of Object.entries(probe)) {
      if (!p.n) continue;
      // −1 (rejected) … +1 (loved), weighted by how much evidence we have for that term.
      const strength = Math.min(1, p.n / 2);
      subGenreVector[term] = Number((((p.sum / p.n) - 3) / 2 * strength).toFixed(3));
    }
    const { signSessionState } = await import('@/lib/sessionToken');
    // A token is only issued for a quiz THIS server ran. A session reconstructed from whatever
    // the client sent — a cold start, a redeploy, or a forgery — still gets its recommendations,
    // but it cannot be exchanged for XP or Popcorn Tokens at /api/user/bootstrap.
    const proofToken = isVerified(sessionKey) ? signSessionState({
      sessionId,
      totalAnswers: history.length, // real ratings only — NOT_SEEN never counts
      affinities: subGenreVector,
      completedAt: Date.now(),
    }) : undefined;

    return NextResponse.json({
      ...baseState, tasteSummary,
      // A timed-out quiz used to be presented as 1.0 certainty. Report what we actually have:
      // a confirmed lock earns 100, running out of questions does not.
      isComplete: true,
      confidenceScore: lockedLove ? 1.0 : Math.max(0.6, Math.min(0.95, confidence)),
      // The final screen recomputed the percentage from scratch and ignored what the user had
      // just been shown: a quiz sitting at 99% ended on 71%, one at 35% ended on 100%. Whatever
      // the engine believes, the number can only move by the same small step as every other
      // answer — it is the same meter, on the same screen, one moment later.
      progressPercent: lockedLove ? Math.min(100, Math.max(prevShown, 96)) 
        : Math.min(prevShown + 4, Math.max(prevShown, Math.max(60, Math.min(95, Math.round(confidence * 100))))),
      userAffinities: subGenreVector,
      currentVectorState: { possibleMoviesRemaining: 1, leadingMicroGenres: [tasteSummary] },
      currentQuestion: null, finalMovies, proofToken,
    }, { status: 200 });
  } catch (error) {
    // The exception text used to be echoed to the caller, which handed an attacker the internal
    // shape of the route. It stays in the server log where it belongs.
    console.error('[brain] ', error);
    return NextResponse.json({ error: 'Brain error' }, { status: 500 });
  }
}
