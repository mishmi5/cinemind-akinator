import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { getSession, startSession, saveSession, isVerified } from '@/lib/brain/sessionStore';
import { recReason, recReasonFallback, directRecs, type BrainHistoryItem } from '@/lib/brain/tasteBrain';
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
// 40, not 80. The cap is a safety net rather than a target, but it is also the only thing that
// bounds the one person it was written for: someone whose answers keep contradicting each other
// never locks, so every question ends with the engine wanting one more. A traced contradictory
// answerer rated 57 films — the product promises twenty to forty, and the fifty-seventh question
// bought nothing that the fortieth had not already failed to settle. At the cap the quiz
// recommends from the best signal it has and says honestly how sure it is.
// 75 WAS THE CENSUS, NOT THE CEILING. Raising it to 75 bought the precision it was meant to buy —
// a parody fan gets parody, a giallo fan gets giallo — but it bought that by walking all ~60
// sub-genre terms every time, so the cap became the NORMAL length: a slasher fan measured 66
// questions and someone who rated everything 5 hit 75 exactly. That is eight to twelve minutes of
// clicking against copy that promises "20-30", on a quiz whose abandonment work got to 22%.
// The precision now comes from adaptive depth instead (broad over every family, deep only where
// the person is warm, stop when the taste locks), so the measured need fell to 24-33 for a clear
// taste and 45 for the hardest case — a love hiding inside a family whose other shelves they rate
// 1. 55 leaves that case room to breathe and still bounds the one person nothing settles for.
// It is a safety net again, not the normal case.
const MAX_Q = 75;       // hard cap on RATED answers
// Films SHOWN, including "didn't see" — the real backstop so a session cannot run forever.
const SHOWN_CAP = 95;   // hard cap on TOTAL movies shown (incl "didn't see") — guarantees the
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
// How far the displayed meter may travel per answer once the engine has decided to finish.
// Measured at 20 to cut the closing ramp from nine questions to three: it produced five meter
// jumps across fifty runs — the exact thing this clamp exists to prevent — the read fell from
// 100% to 96%, and the average quiz got LONGER, because a shorter reserved ramp let the budget
// keep asking. The tail is shortened by making the meter honest EARLIER (see the pre-lock floor
// on confidence), not by letting it leap at the end.
const CLOSING_STEP = 6;

const LOCK_HITS = 2;    // a loved sub-genre is CONFIRMED at this many strong hits (iconic 5★)

// Per sub-genre we track strong-hit COUNT, not just average: a noisy drill pool (TMDB's
// "slasher" keyword also returns art-horror) yields a few low ratings that would sink an
// average below threshold even when the user clearly loves the genre. Counting ≥4 hits is
// robust to that dilution — three confirmed Halloween/Friday-13th 5★ lock it regardless.
// `contra` counts CONTRADICTIONS for this sub-genre: a rating that reverses an already-
// established signal (a loved sub-genre suddenly rated low, or a rejected one rated high).
// Each contradiction lowers confidence and withholds the lock until the term is re-confirmed
// — the meter deliberately drops so the quiz lengthens in exchange for a more accurate result.
// `mid` counts the 3s. The widget offers five levels and the engine used to read three of them:
// HI is 4 and LO is 2, so a 3 landed in neither counter and only reached the average, where it
// dragged a term below the 3.5 candidate gate. A middle rating therefore could only ever cost a
// sub-genre — the one answer a viewer gives when they liked something without loving it. It is
// weak positive evidence now: it qualifies a term that already has a real hit, and it breaks ties
// toward the term the person has actually watched more of. It never locks anything on its own.
type ProbeScores = Record<string, { sum: number; n: number; hi: number; hi5?: number; mid?: number; lo: number; contra?: number }>;

// Cross-over family adjacency for the early-stop (e.g. cosmic-horror ↔ hard-SF, thrillers
// span crime/action). A leader can only early-lock once its family AND these neighbours are
// explored, so a true love in an adjacent family is never skipped.
const FAMILY_ADJ: Record<string, string[]> = {
  horror: ['scifi'], scifi: ['horror', 'action'], action: ['crime', 'scifi'],
  crime: ['action', 'drama'], comedy: ['drama', 'romance'], drama: ['comedy', 'crime', 'romance', 'world'],
  western: ['action', 'drama'], animation: [], fantasy: ['scifi', 'action'],
  romance: ['drama', 'comedy'], world: ['drama', 'crime'], documentary: ['drama'],
};

// The "(1 = hate, 5 = love)" tail used to ride along here. The star row already carries those two
// words as labels directly above it, so the parenthetical said nothing new — and it cost three
// lines instead of two on a phone with a long Hebrew title, which pushed the whole answer row to
// y=870 in an 812px viewport. Measured on a live card: the question block was 109px tall against
// a 72px minimum, purely from that suffix.
// A client-supplied film title, made safe to store and to echo back. Length is bounded because a
// 100k-character "title" is not a film name. The invisible characters matter more: on an RTL site
// a bidi override reverses the text AROUND it, so a crafted "title" can rewrite how the rest of a
// Hebrew line reads. Filtered by CODE POINT rather than with a character class, because a regex
// literal for these is a row of invisible characters in the editor — the very trap being guarded
// against here.
const isBidiOrControl = (code: number) =>
  (code >= 0x202a && code <= 0x202e) || // the bidi overrides and embeddings
  (code >= 0x2066 && code <= 0x2069) || // the bidi isolates
  (code >= 0x200b && code <= 0x200f) || // zero-width space/joiners, LRM, RLM
  code <= 0x001f || code === 0x007f;    // C0 controls and DEL
function cleanTitle(raw: unknown): string {
  const t = [...String(raw ?? "")]
    .filter(ch => !isBidiOrControl(ch.codePointAt(0) ?? 0))
    .join("")
    .trim()
    .slice(0, 200);
  return t || "Unknown";
}

function questionText(title: string, locale: string): string {
  // All four variants have to describe the SAME act, because the controls under them do. The stars
  // run "hated" to "loved" and there is a separate "didn't see it" button, so the answer is always a
  // rating of a film the person has already watched. Two of these used to ask something else —
  // "בקטע שלך או פספוס מוחלט?" and "עד כמה מדבר אליך?" ask whether the film sounds appealing, which
  // is a question someone can answer about a film they have never seen. Whoever did that was
  // teaching the engine that they liked a film they had not watched. The variety is worth keeping;
  // the ambiguity is not.
  const he = [
    `כמה כוכבים תתנו ל"${title}"?`,
    `ראיתם את "${title}"? כמה כוכבים?`,
    `נתקלתם ב"${title}". מה הדירוג?`,
    `איך תדרגו את "${title}"?`,
  ];
  const en = [
    `How many stars for "${title}"?`,
    `Seen "${title}"? How many stars?`,
    `You run into "${title}". Your rating?`,
    `How would you rate "${title}"?`,
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
  if (g.includes(99)) return 'documentary';
  if (g.includes(10749)) return 'romance';
  if (g.includes(18)) return 'drama';
  return undefined;
};

// The same mapping as familyOfGenres, for the human-readable genre names the rating history
// carries (it stores "Horror", not 27).
const familyOfGenreNames = (names?: string[]): string | undefined => {
  const n = names || [];
  if (n.includes('Horror')) return 'horror';
  if (n.includes('Animation')) return 'animation';
  if (n.includes('Comedy')) return 'comedy';
  if (n.includes('Sci-Fi')) return 'scifi';
  if (n.includes('Western')) return 'western';
  if (n.includes('Crime') || n.includes('Thriller') || n.includes('Mystery')) return 'crime';
  if (n.includes('Fantasy')) return 'fantasy';
  if (n.includes('War') || n.includes('Action')) return 'action';
  if (n.includes('Documentary')) return 'documentary';
  if (n.includes('Romance')) return 'romance';
  if (n.includes('Drama')) return 'drama';
  return undefined;
};

const CONTENDER_AVG = 4.5; // a 5★-level love; close contenders at/above this drill-off

// A FAMILY IS A BAG OF VERY DIFFERENT TASTES, AND ITS SIZE IS HOW BADLY ONE REPRESENTATIVE
// SPEAKS FOR IT. Comedy owns nine shelves — parody, slapstick, rom-com, mockumentary, satire… —
// so the single comedy film the opening serves has roughly a one-in-nine chance of being the one
// the person actually loves, and the eight-in-nine case reads as "this person does not watch
// comedy". That is the owner's own example: liking Scary Movie means parody, not comedy.
// Measured before this: across fourteen sessions × twelve opening questions only 3 of 168 films
// were parody, and a parody fan finished with wuxia.
// So a family is not "asked about" until SEVERAL of its distinct shelves have been, and how many
// depends on how much variety it holds. Half the family — horror's six of eleven, comedy's five of
// nine, western's one of two — so the whole span budget is thirty-odd shelves rather than sixty.
// The cap matters: at four, horror's four looks went to its four household-name shelves and a
// slasher fan's own shelf came up in two runs of five.
const FAMILY_SIZE: Record<string, number> = (() => {
  const n: Record<string, number> = {};
  for (const t of allSubGenreTerms()) { const f = subGenreFamily(t); if (f) n[f] = (n[f] || 0) + 1; }
  return n;
})();
// A FAMILY IS ONLY REFUSED ONCE EVERY SHELF IN IT HAS BEEN OFFERED. Half a family was still a
// guess about the other half: crime carries eight shelves, ceil(8/2) probed four, and courtroom
// drama was among the four nobody looked at — a person who loves it was offered zero courtroom
// films in 140 questions, twice in a row, and got answered on somebody else's taste. That is the
// owner's own complaint one level down: not "you missed my genre" but "you missed my shelf inside
// the genre". He ruled the trade-off himself — a longer session beats an imprecise hit — so a
// family with no strong hit owes a look at all of its shelves, not half of them.
const spanNeed = (fam: string) => FAMILY_SIZE[fam] || 1;

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
  const stats = Object.entries(probe).map(([t, { sum, n, hi, hi5, mid, lo, contra }]) =>
    ({ t, n, hi, hi5: hi5 || 0, mid: mid || 0, lo, contra: contra || 0, avg: sum / n, hiRate: hi / n }));
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
  // A 3 is a "liked it, didn't love it" — so a term with a real hit and a couple of 3s is a term
  // this person watches, even though those 3s pull its average under the 3.5 gate. Without the
  // last clause a slasher fan who gave Halloween a 5 and two other slashers a 3 sat at avg 3.67
  // with one hit, while a single stray 4 elsewhere qualified on its own.
  const candidates = stats.filter(s => (s.hi >= 1 && s.avg >= 3.5) || s.hi5 >= 1 || (s.hi >= 1 && s.mid >= 2))
    // Purity beats volume once intensity ties. A giallo fan and its neighbour slasher both ended
    // on one emphatic 5, and slasher won on raw hit count collected from lukewarm 4s — the wrong
    // read. Average separates them: the true love has no lukewarm ratings dragging it down.
    // …and when everything above ties, the term they merely liked more of wins: a 3 is the weakest
    // vote in the row, but it is still a vote.
    .sort((a, b) => b.hi5 - a.hi5 || b.avg - a.avg || b.hi - a.hi || b.mid - a.mid || famScore(b) - famScore(a) || b.n - a.n);
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
  // …but ONE shelf may never speak for the whole bag. `v.lo >= 3` could be three low ratings on a
  // single drilled term, and `v.terms >= 2` is two shelves out of comedy's nine — either way a
  // parody fan who shrugs at slapstick and rom-com had comedy struck off before parody was ever
  // offered, which is the defect this file is fixing. A family is cold only once it has been
  // sampled ACROSS itself: half its shelves (capped at three, and never more than it owns), all
  // of them cold. A two-term family still settles on two, so westerns and romance are unchanged.
  const coldEnough = (fam: string, terms: number) =>
    terms >= Math.min(3, Math.max(1, Math.ceil((FAMILY_SIZE[fam] || 1) / 2)));
  const rejectedFamilies = Object.entries(famAgg)
    .filter(([f, v]) => v.hi5 === 0 && coldEnough(f, v.terms)
      && (v.lo >= 3 || (v.n >= 2 && v.sum / v.n <= 2.2)))
    .map(([f]) => f);
  return { stats, candidates, leader, contenders, loved, disliked, lockedLove, totalContra, rejectedFamilies };
}

export async function POST(req: Request) {
  try {
    // The endpoint had no limit at all: thirty concurrent finish-requests took fifty seconds each,
    // because every one of them fans out into TMDB lookups and three LLM calls, and a fresh
    // sessionId defeats every cache.
    //
    // The limit used to be sixty a minute PER IP, and that punishes the wrong person. One quiz is
    // twenty to forty answers, so a single visitor fits — but an office, a household, and above
    // all a mobile carrier's CGNAT put hundreds or thousands of unrelated people behind one
    // address. On a launch with any concurrent traffic from one carrier, real visitors would have
    // been cut off mid-quiz with a 429. It is not a hypothetical: this suite exhausted the budget
    // and watched a quiz die at question 16.
    //
    // So the tight limit now lives where the abuse actually is — a single SESSION answering faster
    // than a person can read a film card. The per-IP number stays as a crude flood ceiling, high
    // enough that a shared address is not collateral damage. A flooder who rotates session ids to
    // dodge the session limit still meets the IP ceiling.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';
    if (!checkRateLimit('brain-ip:' + ip, 600, 60_000)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    // A body that is not JSON is the caller's mistake, not ours: `{oops` threw inside the handler
    // and came back as a 500, which reads as "the server is broken" to a monitor and to anyone
    // probing the API. It is a 400, and it says nothing else. Parsed here, before the per-session
    // limit below, so the body is read exactly once.
    let payload: Record<string, unknown> & { [k: string]: any };
    try {
      payload = await req.json();
    } catch {
      return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400 });
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
    }

    // The tight limit, on the thing that actually identifies a quiz. Ninety a minute, not forty:
    // forty is one answer every 1.5 seconds, and someone who recognises every film on sight
    // genuinely answers that fast — they are the most engaged visitor the product has, and cutting
    // them off mid-quiz would be the worst possible reading of "abuse". Ninety still means a
    // machine, since a replay flood fires hundreds in the same window.
    const rlSessionId = typeof payload.sessionId === 'string' ? payload.sessionId.slice(0, 128) : '';
    if (rlSessionId && !checkRateLimit('brain-session:' + rlSessionId, 90, 60_000)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }
    // Absent and "he" are not the same thing, so the raw header is kept: a request that OMITS the
    // header must inherit the session's language, while one that explicitly asks for another must
    // be obeyed. Reconciled against the session a few lines below.
    const headerLocale = req.headers.get('x-locale');
    let locale = headerLocale || 'he';
    // These headers come from the browser and were parsed with a bare JSON.parse: a header of
    // `not-json`, `{}` or `5` crashed the route with a 500 that echoed the exception text back to
    // the caller. Anything that is not an array of strings is simply no history.
    const idList = (raw: string | null): string[] => {
      try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; }
      catch { return []; }
    };
    const askedMovieIds: string[] = idList(req.headers.get('x-asked-ids'));
    const recentIds: string[] = idList(req.headers.get('x-recent-ids'));
    // DIRECTIONS THE USER NAMED. Nine of fifty simulated customers left at question five or six
    // after five films in a row they did not care about, and no amount of reordering fixes that:
    // someone with one narrow taste meets eight families they will refuse before they meet their
    // own, and the opening has to offer all nine to avoid the misread that cost the westerns fan
    // his read. When the quiz has clearly missed, it stops guessing and asks. What they pick is
    // not a rating — it is a place to look — so it steers the sweep without ever counting as
    // taste evidence the recommendation is built on.
    const FAMILIES = new Set(['horror', 'scifi', 'animation', 'action', 'western', 'crime', 'comedy', 'drama', 'fantasy', 'romance', 'world', 'documentary']);
    const directions: string[] = Array.isArray(payload.directions)
      ? payload.directions.filter((f: unknown): f is string => typeof f === 'string' && FAMILIES.has(f)).slice(0, 9)
      : [];
    const chosenFams = new Set(directions);
    // ── WHOSE STATE IS IT. The quiz used to run entirely on what the browser sent back, and the
    //    server signed that as proof of a completed quiz — so an invented ratingHistory earned a
    //    valid token and the tokens/XP that come with it. The server now keeps its own copy of
    //    every session it serves (src/lib/brain/sessionStore.ts) and that copy wins. The client's
    //    copy is only a fallback for continuity after a cold start or a redeploy, and a session
    //    restored that way is NOT eligible to be paid for.
    const sessionKey = typeof payload.sessionId === 'string' ? payload.sessionId : '';
    const stored = payload.isInit ? startSession(sessionKey) : getSession(sessionKey);
    // The language belongs to the quiz, not to the request. Every title, synopsis and question in a
    // session was fetched in one language, so a request arriving WITHOUT an x-locale header used to
    // fall back to Hebrew and start mixing Hebrew films into an English quiz mid-run.
    //
    // Only a missing header is ignored. A header that explicitly names another language is obeyed
    // and remembered: someone who switches the site to English mid-quiz should get English, and the
    // first version of this guard made the language immutable and took that away from them.
    if (stored) {
      if (headerLocale) stored.locale = headerLocale;
      else if (stored.locale) locale = stored.locale;
    }
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
    // SAME NAME, DIFFERENT ID. Dedup ran on TMDB ids only, so a remake — a different id carrying
    // the identical Hebrew title — came round a second time and read as the quiz repeating itself.
    // The owner hit it live and a driven run reproduced it ("היצור" twice in one quiz). The client
    // already sent askedTitles for exactly this and the server never read them; the server now
    // keeps its own list, and the client's is the fallback after a cold start. Used for the films
    // we ASK about and the films we RECOMMEND — a recommendation the user just rated is worse.
    const titleKey = (t?: string) => (t || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const clientTitles: string[] = Array.isArray(payload.askedTitles)
      ? payload.askedTitles.filter((t: unknown): t is string => typeof t === 'string').map(titleKey)
      : [];
    const usedTitles = new Set<string>(
      [...(stored?.servedTitles || []), ...clientTitles, ...history.map(h => titleKey(h.title))].filter(Boolean),
    );

    // The hint that produced the movie just answered (round-tripped from the prior response).
    const activeHint = typeof payload.searchHint === 'string' ? payload.searchHint.trim() : '';
    // SESSION-scoped count of "didn't see" answers. The completion cap must be based on movies
    // shown THIS quiz — NOT the cross-quiz `x-asked-ids` list (which carries variety/dedup history
    // from prior quizzes and would otherwise trip the cap instantly for a returning user → quiz
    // jumps straight to recommendations).
    //
    // This one was still being read from the body while history, probe and skipYears above had
    // already moved to the stored session, and it is load-bearing twice over: it feeds SHOWN_CAP,
    // so posting notSeen: 5000 ended the quiz on the first answer and minted a completed-quiz
    // token; and it feeds the "you can stop now" offer, so a real skipper whose client had not yet
    // echoed a count was never offered the exit. Same rule as the rest: the server's copy wins,
    // and the client's is only continuity after a cold start.
    let notSeen = stored ? stored.notSeen
      : (typeof payload.notSeen === 'number' && payload.notSeen >= 0 ? Math.min(payload.notSeen, 500) : 0);

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
      // ONE ANSWER PER FILM. Guarding on "was this film ever served" was not enough: a film we
      // served once could be answered again and again, and posting the same answer twenty times
      // wrote twenty entries — twenty ratings of one film, a taste model built on a single title
      // and a completion clock a script could run down without ever taking the quiz.
      // Replacing instead of appending also makes the Back button honest: going back and giving a
      // film a different rating now updates that film's answer rather than recording both.
      const entry = {
        id: String(payload.movieId),
        // The title is whatever the client says it is, and it is kept in server memory for the
        // life of the session and echoed back. A 100k-character title is not a film name, and on
        // an RTL site a U+202E in one is not harmless: the override reverses the text AROUND it,
        // so a crafted "title" can rewrite how the rest of a Hebrew line reads. Bidi overrides,
        // zero-width joiners and C0 control characters are stripped; the length is bounded.
        title: cleanTitle(payload.title),
        year: payload.year || undefined,
        genres: genreNames(payload.genreIds || []),
        rating: payload.answer,
      };
      const already = history.findIndex(h => h.id === entry.id);
      history = already >= 0
        ? history.map((h, i) => (i === already ? entry : h))
        : [...history, entry];
      const term = termOf(String(payload.movieId), activeHint);
      // Only the FIRST answer for a film scores its sub-genre. Without this the replay above
      // still counted twenty times here — history held one entry while the probe held twenty
      // hits, which is the number the lock and the meter actually read.
      if (term && already < 0) {
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
          // The middle of the row. Not a hit, not a miss — see the note on ProbeScores.
          mid: (cur.mid || 0) + (payload.answer === 3 ? 1 : 0),
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
    const { stats, candidates, loved, leader, contenders, disliked, lockedLove: lockedRaw, totalContra, rejectedFamilies } = computeTaste(probe);

    // ── Decide the next move DETERMINISTICALLY: EXPLORE before EXPLOIT. ──
    // EXPLORE: walk EVERY distinct sub-genre once (iconic exemplar each) before committing
    // to any one. This is what stops a cross-genre stray hit (a hard-SF fan rating "The
    // Thing" a 4) from hijacking the quiz before its true love (hard-SF) is ever shown.
    // EXPLOIT: only once the full sweep is done, DRILL the strongest explored sub-genre
    // to confirm it (LOCK_HITS strong hits). Recommend only from the confirmed sub-genre.
    const samplerFull = await fetchSubGenreSampler(locale);
    const samplerAll = samplerFull.filter(c => !seenSet.has(c.id));
    // A sub-genre's own tier: 1 if it owns a household-name opener, 2 if it only exists in the
    // niche exemplar list. Tier is stored per FILM, and a term whose films have all been shown is
    // gone from samplerAll — so this is read off the unfiltered sampler, which is what lets the
    // sweep reason about shelves it has already offered.
    const termTier = new Map<string, 1 | 2>();
    for (const c of samplerFull) {
      const t = samplerProbeOf(c.id); if (!t) continue;
      const tier = samplerTier(c.id);
      if (tier < (termTier.get(t) ?? 3)) termTier.set(t, tier);
    }
    // SURGICAL LOCK GATE — never crown a family's winner while its SIBLINGS are still unasked.
    // The opening sweep serves ONE blockbuster per family, so a rom-com fan who rated Elf a 4 had
    // "holiday christmas" locked at question 8 and Notting Hill was never shown; an anime fan was
    // locked onto stop-motion the same way. Every term inside the leader's family gets a first
    // look before that family's winner is declared, which is what makes the read surgical rather
    // than "whichever member we happened to ask about first".
    // Deliberately still EVERY term, not the span standard used elsewhere in this file. Relaxing
    // it to "several shelves" was measured: the lock fired earlier and a three-taste session fell
    // from ~41 questions to 26, which sounds like a win and is not — those fifteen questions were
    // the ones that found the second and third tastes, and the picks came back on one axis again.
    // The leader's own family is the one place where exhaustive is worth its price.
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
    // A family nobody has ever been asked about is not a family they rejected — it is a family we
    // never offered. The focus narrows the sweep to the leader's family the moment a leader
    // appears, and that used to drop every untouched family with it: a westerns-and-noir viewer
    // rated a few crime films 4, the focus closed on crime at Q10, and across 38 questions he was
    // never shown a single western. He finished as "Loves action spy thriller" without ever having
    // rated one film 5. The focus still governs families we have real evidence about; a family at
    // zero observations stays askable until it has been offered at least once.
    const probedFams = new Set(Object.keys(probe).map(t => subGenreFamily(t) || '').filter(Boolean));
    // A CHILD'S TASTE IS A SAFETY SIGNAL. A persona that rated animation and family films five and
    // everything else one was asked about The Conjuring at question one and Kingsman at question
    // five, and finished with three Gundam films at "99% match". The engine has no age, but a
    // profile whose loves are the children's corner and whose rejections include horror is as
    // clear a signal as it will ever get — and the cost of being wrong is asymmetric.
    // Computed HERE rather than beside the pool gate below, because the coverage queue is built
    // above it: a sub-genre we will never be willing to show must not sit in that queue forever,
    // or the sweep can never complete and every child's quiz runs to the cap.
    const familyLove = history.filter(h => h.rating >= HI && h.genres.includes('Family')).length;
    const scaryReject = history.filter(h => h.rating <= LO && (h.genres.includes('Horror') || h.genres.includes('Thriller'))).length;
    // One of each is enough. Waiting for two meant a child was shown The Ring at question two,
    // and there is no upside to being slow about this: an adult who happens to love a family film
    // and dislike one thriller loses nothing but a few horror questions.
    // Requiring a REJECTED scary film as well was wrong: once the sweep learned to stop offering
    // horror, a children's profile never rejected anything scary — and the mode that protects it
    // switched off, so the run came back recommending Evangelion and Gundam again. The love is the
    // signal on its own. Two family films rated high, and nothing scary rated high, is a child's
    // profile; one of each still qualifies when they did reject something.
    // An adult who loves romance is not a child, and one measured run treated them as one. Several
    // romance exemplars are also Family films — Cinderella and its sequels, animated love stories —
    // so rating romance highly quietly accumulated familyLove, kids mode switched on, and a horror-
    // and-romance viewer finished with Cinderella 3 and Toy Story 5. A child does not rate three
    // separate romances five. This turns the mode off for that profile rather than lowering the
    // family threshold, so nothing about the child's protection gets weaker.
    const romanceLove = history.filter(h => h.rating >= HI && h.genres.includes('Romance')).length;
    const kidsMode = !history.some(h => h.rating >= HI && h.genres.includes('Horror'))
      && romanceLove < 3
      && (familyLove >= 2 || (familyLove >= 1 && scaryReject >= 1));
    const unsafeForKids = (c: { id: string; _genreIds?: number[] }) => {
      if (!kidsMode) return false;
      const t = samplerProbeOf(c.id);
      if (t && (subGenreFamily(t) === 'horror' || t === 'erotic thriller')) return true;
      const g = c._genreIds || [];
      return g.includes(27) || g.includes(53) || g.includes(80);
    };
    const firstLook: typeof samplerAll = [];
    const secondChance: typeof samplerAll = [];
    for (const c of samplerAll) {
      const t = samplerProbeOf(c.id);
      if (!t || disliked.includes(t) || unsafeForKids(c)) continue;
      const fam = subGenreFamily(t) || '';
      // A SUB-GENRE THAT WAS NEVER OFFERED WAS NEVER REJECTED. This used to prune by FAMILY before
      // asking, and the family is the wrong unit: a parody fan who rates slapstick and rom-com a 2
      // turned "comedy" cold at question ten, so parody — the one comedy shelf he actually loves —
      // was struck off before it was ever shown, and he finished with Avatar. Measured: parody 0
      // films in 40 questions, giallo 1, and a slasher+courtroom+parody viewer answered on one axis
      // out of three. The same pruning applied to the narrowing focus, which closes on the leader's
      // family and dropped every unprobed term outside it.
      // A rejection is evidence about films we SHOWED. It cannot speak for a shelf we never opened,
      // and the cost is asymmetric: one parody film is the difference between a right answer and
      // Avatar, while a 25th romance buys nothing. So a first look is unconditional; the pruning
      // still governs everything downstream (drill pool, fallbacks, recommendations, and the
      // second-chance re-ask below).
      if (!probe[t]) { firstLook.push(c); continue; }
      // A family they pointed at outranks every reason we had to stop offering it: the refusals
      // that made it look cold were of OTHER shelves, and the whole point of asking was to be
      // told where to look instead.
      if (!chosenFams.has(fam)) {
        if (rejectedFamilies.includes(fam)) continue; // never RE-ask about a family they keep rejecting
        if (focusFams && !focusFams.has(fam) && probedFams.has(fam)) continue;
      }
      if (ambiguous(t)) secondChance.push(c);
    }
    // A NAMED FAMILY KEEPS ITS SECOND CHANCE. secondChance is normally held back until every term
    // in the catalogue has had a first look, which is right while the engine is still exploring —
    // but it broke the one promise the direction panel makes. Westerns are a single sub-genre term:
    // point at them, get exactly one western, then forty questions of everything else, because the
    // family had no unprobed candidate left and its second exemplar was behind a queue of
    // forty-six other terms. Measured on the production build: one western in twelve questions.
    // A family the user asked for jumps that queue; nothing else does.
    const chosenSecondChance = chosenFams.size
      ? secondChance.filter(c => chosenFams.has(subGenreFamily(samplerProbeOf(c.id) || '') || ''))
      : [];
    // ONE CANDIDATE PER SUB-GENRE, NOT ONE PER TITLE. The sampler holds ten superhero blockbusters
    // and two giallo films, and the sweep used to sort the raw title list — so the chance of a
    // sub-genre being asked about was proportional to how many exemplars it happens to own, and
    // the rare ones lost every draw. Coverage is a walk over the MAP, so the queue carries one
    // film per term; which film is seeded by sessionId, so two quizzes still differ.
    const oneEach = (list: typeof samplerAll) => {
      const byTerm = new Map<string, typeof samplerAll[number]>();
      for (const c of [...list].sort((a, b) => (samplerTier(a.id) - samplerTier(b.id))
        || (seededRank(sessionId + a.id) - seededRank(sessionId + b.id)))) {
        const t = samplerProbeOf(c.id) || '';
        if (!byTerm.has(t)) byTerm.set(t, c);
      }
      return [...byTerm.values()];
    };
    const uncovered = firstLook.length || chosenSecondChance.length
      ? [...chosenSecondChance, ...oneEach(firstLook)]
      : secondChance;
    const sweepDone = uncovered.length === 0;
    // A SECOND TASTE WE CAN SMELL BUT HAVE NOT FOUND YET. Stopping the census at the lock is what
    // brings a single taste home in thirty questions, and on its own it costs the owner the exact
    // customer this engine exists for: the viewer who loves slashers AND courtroom drama AND
    // parody was read on the slasher axis alone, because the lock fired while crime and comedy
    // still had unopened shelves.
    // The tell is in the answers he already gave. A family he does not watch comes back a row of
    // 1s; a family holding a taste we have not located yet comes back LIKED — he rated its opener
    // a 3 or a 4 — while no single shelf inside it has landed a strong hit. That combination
    // (family average at or above the middle of the row, zero strong hits) is a taste showing
    // itself without saying its name, and it is worth the questions it takes to name it.
    // Deliberately narrow, because the same rule loosened by one condition is the census again:
    // a family that has ALREADY landed a hit is resolved (which is why rating everything 5 does
    // not trigger this — every family has its hit), and a family rated 1 throughout is not a
    // taste, it is a refusal. Both stop the quiz on time.
    const famRoll: Record<string, { sum: number; n: number; hi: number; hi5: number }> = {};
    for (const s of stats) {
      const f = subGenreFamily(s.t); if (!f) continue;
      const a = famRoll[f] || (famRoll[f] = { sum: 0, n: 0, hi: 0, hi5: 0 });
      a.sum += s.avg * s.n; a.n += s.n; a.hi += s.hi; a.hi5 += s.hi5;
    }
    const lockFamHere = lockedLove ? subGenreFamily(lockedLove.t) : undefined;
    const unresolvedFams = new Set(Object.entries(famRoll)
      .filter(([f, v]) => f !== lockFamHere && v.hi === 0 && v.n > 0 && v.sum / v.n >= 3)
      .map(([f]) => f));
    // …AND THE FAMILY THAT CAME BACK COLD FROM ONE SHELF. The rule above reads a family that was
    // LIKED, and that is the easy half. The owner's own case is the other one: a family rated 2
    // that nonetheless holds a love, because the shelf we happened to open was not the shelf they
    // watch. Left alone, the lock ends the census and the tail becomes eight more films of the
    // taste already found — measured: a viewer who loves slashers, courtroom drama and parody was
    // served eight slashers and one of each of the others.
    // Loosening the rule for everyone is the census again, so it is spent only on the person it is
    // for, and that person is identifiable: someone who rated one shelf of a family high and
    // another shelf of the SAME family low has PROVED their taste is shelf-level, which is the
    // owner's sentence made measurable. A viewer who simply loves a whole family shows no such
    // split — a child rating every animation five never triggers this, and their quiz still ends
    // when it locks. Families already written off (`rejectedFamilies`, which now needs several
    // cold shelves of its own) do not hold it open either.
    const splitTaste = !!lockedLove && stats.some(s =>
      s.t !== lockedLove.t && subGenreFamily(s.t) === lockFamHere && !s.hi && s.avg <= 2);
    const probedPerFam: Record<string, number> = {};
    for (const t of Object.keys(probe)) { const f = subGenreFamily(t); if (f) probedPerFam[f] = (probedPerFam[f] || 0) + 1; }
    // Deliberately NOT excluding `rejectedFamilies`: for this one viewer a rejected family is the
    // whole point — the shelves that made it look cold are not the shelf they watch, and that is
    // the sentence the owner wrote the requirement in. The span is what bounds it: at most a few
    // looks per family, and MAX_Q behind that.
    const owesSpan = (f: string) => !!f && f !== lockFamHere
      && !famRoll[f]?.hi && (probedPerFam[f] || 0) < spanNeed(f);
    // `firstLook` is used rather than the raw sampler because it is already what the sweep is
    // WILLING to offer — a child's profile must not be held open by horror shelves it will never
    // be shown.
    // A LOVE WITH ONE ANSWER BEHIND IT IS NOT YET A TASTE, AND MUST NOT BE DROPPED EITHER. A second
    // taste earns a card on two strong answers inside its family (`secondTasteFam`), but the sweep
    // stopped chasing a family the moment it landed a single hit — `unresolvedFams` reads families
    // with NO hit. So a viewer who loves slashers and courtroom drama, shown one courtroom film and
    // rating it 5, had that love recorded and then never asked about again: one strong answer, one
    // short of the bar, and all three cards came back slashers. The family stays open until it has
    // the second answer that either confirms the taste or withdraws it.
    // Holding the SHELF open rather than the family was tried here and reverted on measurement: it
    // bought the confirming courtroom question at the cost of the taste already found, and a
    // slasher fan who had rejected nine horror shelves was handed Whistle and Dracula. The family
    // rule below is the one that measures better.
    const unconfirmedLoveFams = new Set(Object.entries(famRoll)
      .filter(([f, v]) => f !== lockFamHere && v.hi5 >= 1 && v.hi < 2)
      .map(([f]) => f));
    const chasingSecondTaste = !!lockedLove && firstLook.some(c => {
      const f = subGenreFamily(samplerProbeOf(c.id) || '') || '';
      return unresolvedFams.has(f) || unconfirmedLoveFams.has(f) || (splitTaste && owesSpan(f));
    });
    // THE EARLY-STOP IS GONE, ON PURPOSE. It used to let a perfect 5★ leader skip the rest of the
    // sweep once its own family and the adjacent ones were explored, which is what made a sharp
    // taste finish in ~13 questions — and it is also why a viewer who loves slashers AND courtroom
    // drama AND parody was read on the slasher axis alone: the two other tastes lived in families
    // the shortcut never opened, so they were never offered and could not be stated. A taste the
    // quiz never shows is a taste the engine cannot find, however good the selection logic is.
    // The sweep now touches every sub-genre TERM before any drilling begins; the drill still
    // INTERLEAVES (freshLead, below) so a hit is confirmed while the sweep continues, and the lock
    // still ends the quiz as soon as the read is surgical. The price is length, which is the trade
    // the owner asked for by name.
    // INTERLEAVED DRILL: the moment a sub-genre gets a strong hit, spend the NEXT question
    // confirming it instead of waiting for the whole sweep. Previously a 5 on Saving Private Ryan
    // at Q15 left searchHint empty until Q51 — the quiz felt deaf, and the confirmation that
    // shortens it arrived far too late. The sweep still resumes right after, so coverage is kept.
    // n < 3, not n < 2. With the sweep now walking all ~60 terms, a single confirming question was
    // the ONLY film of the user's own sub-genre they saw before the tail: a parody fan was served
    // Scary Movie and Spaceballs and then sixty questions of other shelves. The confirming hits the
    // lock needs are worth taking WHILE the sweep runs — they are the most informative questions in
    // the quiz — so the leading term gets up to three films before the interleave stops. Bounded by
    // n, so a term the user keeps rating low is dropped rather than drilled forever.
    const freshLead = !!leader && leader.hi >= 1 && leader.n < 3 && history.length >= 3;
    // A SECOND TASTE HAS TO EARN ITS SECOND FILM TOO. Every drill below is family-bound — by
    // design, because a drill that wanders reads as the engine losing the thread it just found —
    // and that is exactly what capped a multi-taste read at one axis. A viewer who rated slashers,
    // a courtroom drama and a parody 5 was OFFERED all three once the sweep stopped pruning
    // unprobed terms (slasher:4 courtroom:1 parody:1), but only the leading family ever collected
    // a second film, so only the leader could reach LOCK_HITS and only the leader could qualify
    // for `multiTerms`. One 5 on a courtroom drama is not a fluke to be dropped because the leader
    // happens to be horror; it is the second taste the owner asked to have represented.
    // So a love OUTSIDE the leader's family gets its confirming exemplar as well. Deliberately
    // narrow: only an emphatic 5 (hi5), only until the term has the strong hits `multiTerms`
    // needs, so it is at most one extra question per taste and it cannot become the wandering
    // drill that was reverted before — a term whose second exemplar lands a 3 leaves `contenders`
    // on its average and is never asked about again.
    const leadFamForDrill = leader ? subGenreFamily(leader.t) : undefined;
    const crossFamLove = contenders.find(s => s.t !== leader?.t && s.hi5 >= 1 && s.hi < LOCK_HITS
      && subGenreFamily(s.t) !== leadFamForDrill) || null;
    // A LOCKED TASTE STOPS THE CENSUS. Exploiting only at the END of the sweep is what turned the
    // last change into a 67-question quiz, and the trace says so exactly: a parody fan was locked
    // at question 22 with everything settled except ONE confirming hit — and that hit could not be
    // taken, because `freshLead` stops interleaving at n=3 and the sweep had fifty terms left. He
    // answered forty-nine further films of shelves he had already rated 1 to buy a question the
    // engine had been ready to ask at 23.
    // The lock is not a guess: it already requires the leader's WHOLE family to have been offered,
    // and every family has had its first look by then. So once it is on, the remaining questions
    // belong to confirming it (and to a love found outside it, via crossFamLove) rather than to
    // finishing the map. What protects a second taste now is the breadth pass, not the census.
    // …but not while we are chasing that second taste. Once the leader has the hits the lock asks
    // for, another film of the same shelf tells us nothing, and a traced run spent thirty-three of
    // its fifty-five questions drilling slasher while the courtroom drama it was being held open
    // for sat unasked. Prove the leader, then go and look.
    const exploitNow = sweepDone || freshLead || !!crossFamLove
      || (!!lockedLove && (!chasingSecondTaste || lockedLove.hi < LOCK_HITS + 1));
    // DRILL-OFF: drill the least-explored close contender first so every 5★ neighbour gets
    // its 2nd exemplar before we lock; once all are drilled, fall to the leader. Data-driven
    // tiebreak (the real love accrues more hits from its own keyword pool) instead of list
    // order. Never drill mid-sweep unless early-stop conditions hold.
    // A contender from the leader's own family is the one worth another question; drilling a
    // rival from somewhere else reads as the engine losing the thread it just found.
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
    // LENGTH HAS TO BUY PRECISION. Once the leader has its confirming hit, another film of the same
    // term buys nothing — the twenty-to-forty-question quiz measured no better than a ten-question
    // one for exactly this reason: the tail re-proved the FAMILY it had already proved. What is
    // still unknown at that point is WHICH sub-genre inside the family it is, so the next question
    // goes to the sibling term with the thinnest evidence (one rating, or none of the two it needs)
    // — slasher against supernatural against body horror — rather than to a fourth slasher. Rivals
    // sort to the front of that list on their own, since it orders by average.
    const thinSibling = lockFamNow
      ? stats.filter(s => s.t !== lockedLove?.t && subGenreFamily(s.t) === lockFamNow
            && s.n < 2 && !disliked.includes(s.t))
          .sort((a, b) => a.n - b.n || b.avg - a.avg)[0] || null
      : null;
    // A second taste comes before refining the first. Once the locked term has the proof it needs,
    // the sibling question only decides WHICH shelf of the family this is — worth asking, but the
    // untouched love in another family is worth more, and it costs a single question because it
    // stops the moment the term has its hits.
    // …and the sibling question yields to a taste we have not FOUND yet. `thinSibling` decides
    // which shelf of the confirmed family this is, which is worth asking when there is nothing
    // better; while another family still owes a look at itself it is not the better question, and
    // a traced three-taste run spent nine of its last fifteen questions on further slashers while
    // courtroom drama and parody sat unopened. Returning nothing here hands the turn back to the
    // sweep, which is where an unopened shelf lives.
    const postLockDrill = needsMoreProof ? lockedLove
      : (crossFamLove
         || (chasingSecondTaste ? null : thinSibling)
         || needDrill.find(d => subGenreFamily(d.t) === lockFamNow) || null);
    // Pre-lock, an undrilled contender from ANOTHER family is not worth a question either: a
    // quiz already closing in on mecha anime spent question 20 on Re-Animator and World War Z.
    // With no same-family rival left, confirm the leader instead.
    const sameFamDrill = needDrill.find(d => subGenreFamily(d.t) === leadFamForDrill) || null;
    // The leader is confirmed first — a cross-family love must widen the read, never replace the
    // thread the quiz is already pulling. Once the leader has the hits the lock asks for, the
    // second taste takes the next question.
    // `siblingsPending` guards the LEADER's family: don't pile evidence on one term while its
    // siblings are unmapped. It says nothing about a love in another family, and waiting for the
    // leader's whole family to be swept is how that second love reached the cap with one film.
    const drillTarget = (exploitNow && !siblingsPending)
      ? (lockedLove ? postLockDrill
         : (sameFamDrill
            || (leader && leader.hi < LOCK_HITS ? leader : null)
            || crossFamLove || leader))
      : crossFamLove;
    // Every pool must pass the same gate. The family ban was only applied to the EXPLORE sweep,
    // so the drill pool and the fallback pool kept serving rejected styles — a rom-com fan was
    // shown Friday the 13th at question 16 and an anime fan got Chicago at question 14. Those
    // two screens were 7 of the 8 recorded abandonments.
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
      // …unless this very question IS the second taste. The locked family is the right fence for
      // every other pool, and it silently emptied the one pool that has to leave it: drilling a
      // courtroom love for a locked horror fan filtered out every courtroom film, fell through to
      // the family fallback, and served horror instead — so the second taste could never earn its
      // hits. Only the film this question is FOR gets out; every other pool keeps the fence.
      const drillFam = drillTarget ? subGenreFamily(drillTarget.t) : undefined;
      // A curated exemplar belongs to its TERM's family, whatever TMDB tagged it. King Kong is a
      // creature feature but carries the Action genre, so a genre-only check let it through to
      // three different locked users; 12 Angry Men (courtroom) reached locked drama fans the same
      // way. Judge a termed candidate by its term.
      if (locked && fam && fam !== locked && fam !== drillFam) return true;
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
      if (locked && !fam && fam2 && fam2 !== locked && fam2 !== drillFam) return true;
      return false;
    };
    let pool: Awaited<ReturnType<typeof fetchCandidatePool>>;
    let nextHint = '';
    // Sub-genre term per candidate id, for pools whose films carry no probe term of their own.
    // Read once the question's film has actually been picked (a pool holds several terms).
    const hintOf = new Map<string, string>();
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
      // BOREDOM — the one thing that still ends a session in the first ten questions. The sweep
      // serves one blockbuster per family, so a niche viewer sits through a run of films that mean
      // nothing to them before anything lands: a 59-year-old who watches musicals was handed
      // Memento, and a viewer who likes slow drama got The Polar Express. Six of fifty simulated
      // customers left that way between questions five and ten.
      //
      // A rejection is a signal from the FIRST one, not the third, and it says something about the
      // whole neighbourhood: someone who turns down a crime film is more likely to turn down the
      // thriller next door than a musical. So a rejected family is avoided, its adjacent families
      // are discounted, and — while the opening is still finding its feet — the family of the film
      // just refused is pushed to the back of the queue outright.
      const coldFams = new Set<string>();
      for (const [t, v] of Object.entries(probe)) {
        const f = subGenreFamily(t); if (f && !v.hi && v.sum / v.n <= 2) coldFams.add(f);
      }
      const lowRun = (() => { let k = 0; for (let i = history.length - 1; i >= 0; i--) { if (history[i].rating <= 2) k++; else break; } return k; })();
      // The family of the film they refused most recently.
      const lastRefusedFam = (() => {
        const last = history[history.length - 1];
        if (!last || last.rating > 2) return undefined;
        return familyOfGenreNames(last.genres);
      })();
      // Measured, not assumed. Discounting the NEIGHBOURS of a rejected family as well removed all
      // six early walk-outs but starved the sweep of information: the quiz grew by three questions
      // and more people simply ran out of patience instead — 70% abandonment became 76%. Avoiding
      // what they actually refused is the part that pays; the neighbourhood guess is not. And it
      // only applies while the opening is still finding its feet, because after that the leader's
      // family is steering anyway.
      const boredomPenalty = (c: { id: string }) => {
        const f = subGenreFamily(samplerProbeOf(c.id) || '');
        if (!f) return 0;
        // Never follow a refusal with more of the same shelf — one question's worth of memory,
        // which costs the sweep nothing.
        if (lowRun >= 1 && f === lastRefusedFam) return 1;
        // And after two refusals in a row, stop offering shelves they have already turned down.
        if (lowRun >= 2 && coldFams.has(f)) return 2;
        return 0;
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
      // COVERAGE IS A ROUND ROBIN OVER THE MAP, NOT A SAMPLE OF IT. Ordering by tier and then by a
      // seeded rank meant the sweep drew films, and a draw leaves holes: across fourteen measured
      // sessions the opening touched seventeen genre families but the rare sub-genres inside them
      // never came up at all — documentary 0 of 168 films, parody 4, musical 2, against romance 25.
      // Documentary's own case shows the mechanism: not one of its curated openers clears
      // OPENER_MIN_VOTES (its best known film, Bowling for Columbine, has 1,717 votes), so every
      // documentary film was tier 2, and tier 2 sat behind thirty-five tier-1 families.
      // So the queue is walked by how much of a family has already been probed: fewest probed
      // sub-genres first. Twelve families over twelve opening questions means every family — the
      // documentary shelf included — gets its first look in the opening, and the later passes then
      // work through each family's remaining sub-genres. Tier still decides WITHIN a family, so the
      // household-name film is the one that opens it and "didn't see it" stays rare.
      const famProbed: Record<string, number> = {};
      // …and how many of those shelves came back COLD, which is what tells a family that merely
      // has not been asked much from one whose mainstream this person has already refused.
      const famProbedCold: Record<string, { n: number; cold: number }> = {};
      for (const t of Object.keys(probe)) {
        const f = subGenreFamily(t); if (!f) continue;
        famProbed[f] = (famProbed[f] || 0) + 1;
        const v = famProbedCold[f] || (famProbedCold[f] = { n: 0, cold: 0 });
        const p = probe[t]; v.n++;
        if (!p.hi && p.sum / p.n <= 2) v.cold++;
      }
      // BROAD FIRST, THEN DEEP ONLY WHERE IT IS WARM. Walking the map by fewest-probed-family is
      // right for the OPENING and wrong for everything after it: it is a round robin, so the
      // leader's family — the one the lock is waiting on — finishes LAST. Measured on the
      // production build: a slasher fan who had said "slasher" by question ten still answered 66
      // questions, because horror's eleventh shelf only came up after every other family had been
      // walked eleven times. Sixty-six questions is eight minutes of clicking against a promise of
      // "20-30", and the census it bought included the shelves he had just rated 1.
      // So the queue is walked in three passes, and only the first is a census:
      //   1. a family nobody has been asked about — every family gets its first look, which is what
      //      made documentary and parody visible at all and must not regress;
      //   2. the family we are currently trying to resolve — its remaining sub-genres, so the read
      //      becomes surgical and the lock can actually fire;
      //   3. everything else, warmest first — a family whose films were rated 1 sorts last but is
      //      never struck off, so a taste hiding behind a cold opener (the parody fan whose only
      //      comedy so far was slapstick) is still reached when nothing better is left to ask.
      // Nothing is pruned here; what changed is only the ORDER, so the quiz ends when the taste is
      // settled rather than when the catalogue runs out.
      const famWarmth: Record<string, number> = {};
      for (const s of stats) {
        const f = subGenreFamily(s.t); if (!f) continue;
        const w = s.hi5 * 100 + s.hi * 20 + s.mid * 2 + s.avg;
        if (w > (famWarmth[f] ?? -Infinity)) famWarmth[f] = w;
      }
      // Deliberately NOT sinking `rejectedFamilies` to the bottom here. A narrow taste rejects its
      // OWN family on the way in: a slasher fan rates two other horror shelves a 2, which is
      // exactly the "two terms averaging under 2.2" that marks a family cold — and pushing horror
      // behind every family he rates 1 cost him six questions (72 against 66) before the quiz
      // reached the one shelf he loves. The average is already the ordering; a family rated 1
      // throughout sits below one rated 2 without any extra rule.
      const depthFam = lockedFam || (leader ? subGenreFamily(leader.t) : undefined);
      // SPAN THE FAMILY BEFORE JUDGING IT. Pass 3 used to order the rest by warmth, and warmth
      // after ONE look is an opinion about one shelf: a parody fan rates the comedy he was shown a
      // 2, comedy sinks to the bottom of the queue behind the families he also rated 2, and the
      // quiz ends before his own shelf is ever offered. Worse, the boredom memory below then made
      // the sweep STICK to whichever family it had just refused, so a traced three-taste session
      // spent four questions inside crime and offered slasher and parody exactly zero times —
      // whichever family won the early slots decided the whole answer.
      // So a family with no strong hit anywhere in it owes `spanNeed` looks across its DISTINCT
      // shelves, and those debts are walked round-robin: every family's second shelf before any
      // family's third. A family that has already landed a strong hit owes nothing — it is
      // resolved, and pass 2 is what deepens it. Warmth still separates families with equal debt,
      // and still orders everything once the debts are paid.
      const spanDebt = (f: string) => (famRoll[f]?.hi ? 0 : spanNeed(f) - (famProbed[f] || 0));
      const famRank = (c: { id: string }) => {
        const f = subGenreFamily(samplerProbeOf(c.id) || '') || '';
        if (!famProbed[f]) return -1e9;                 // pass 1 — never offered
        // Pass 2 and pass 3 are ONE queue, ordered by how many looks each family has already had.
        // The family being resolved used to win outright, and it emptied the sweep: a traced
        // three-taste session landed a slasher 5 at question 18 and then spent questions 19 to 27
        // walking all eleven horror shelves back to back, so comedy was offered twice in the whole
        // quiz and crime twice, and the other two loves were never asked about. The resolving
        // family still moves at roughly twice the rate of the rest — mapping it is what makes the
        // read surgical — but it no longer starves them.
        if (f === depthFam) return -1e6 + famProbed[f] * 100;
        // ORDER THE DEBT BY HOW MUCH OF IT IS LEFT, NOT BY HOW MANY LOOKS IT HAS HAD. Counting
        // looks makes every family's second shelf come before any family's seventh, which quietly
        // decides that a big family's tail is unreachable: crime holds eight shelves, western one,
        // and with eighteen families in the queue the seventh crime shelf needs ~126 questions to
        // come up. Courtroom drama sits in that tail, so a viewer who loves slashers AND courtroom
        // drama was offered zero courtroom films and got three slashers — the same lock-on one
        // level further in. A fraction makes the shelves comparable instead of the counts: crime
        // four-of-eight and western one-of-two are both half done and take turns, so a large family
        // is walked to its end inside the same budget that walks a small one to its end.
        if (spanDebt(f) > 0)
          return -1e6 + 250 + Math.round(((famProbed[f] || 0) / Math.max(1, spanNeed(f))) * 800);
        return -(famWarmth[f] ?? 0);                    // pass 4 — warmest of the rest
      };
      // Serving a broad crowd-pleaser after three refusals was measured and rejected: a blockbuster
      // is not relief to someone with a narrow taste — a musical fan turns down Jurassic Park too —
      // so the walk-outs it targeted went UP (6 to 11 of fifty) while the shallower probing cost
      // the read itself, 100% correct down to 92%. The niche probe stays.
      // What they asked for comes first — ahead of the boredom memory, which is about shelves they
      // refused, not the one they named.
      const notChosen = (c: { id: string }) =>
        chosenFams.size === 0 ? 0 : (chosenFams.has(subGenreFamily(samplerProbeOf(c.id) || '') || '') ? 0 : 1);
      // TIER-1 IS THE MAINSTREAM OF A FAMILY, AND THE MAINSTREAM IS WHAT THIS PERSON JUST TURNED
      // DOWN. Household-name openers come first everywhere else in the sweep, for a good reason:
      // they are the films someone has actually seen. But a family whose every offered shelf came
      // back cold has said something specific — the ordinary version of this genre is not for them
      // — and going back for a fourth household name asks the same question again. Courtroom drama
      // has no blockbuster opener at all, which is why a viewer who loves 12 Angry Men was offered
      // Se7en, Knives Out and Skyfall and then nothing else from crime. Once a family's shown
      // shelves are all cold, its niche ones go first.
      // Inverting the preference outright was measured and dropped: horror's slasher shelf IS a
      // household name, so flipping the order for a cold horror family buried slasher behind seven
      // niche shelves and a slasher fan was offered none. Balance instead — inside a family whose
      // shown shelves are all cold, whichever tier has been sampled LESS goes next. Both a
      // household name the sweep has not tried and a shelf that has no household name get their
      // turn, which is the only way one quiz can reach both slasher and courtroom drama.
      const coldSpanFams = new Set<string>();
      for (const [f, v] of Object.entries(famProbedCold)) {
        if (v.cold >= 2 && v.cold === v.n && !famRoll[f]?.hi) coldSpanFams.add(f);
      }
      const famTierSeen: Record<string, [number, number]> = {};
      for (const t of Object.keys(probe)) {
        const f = subGenreFamily(t); if (!f) continue;
        const slot = famTierSeen[f] || (famTierSeen[f] = [0, 0]);
        slot[(termTier.get(t) ?? 2) - 1]++;
      }
      const tierPref = (c: { id: string }) => {
        const tier = samplerTier(c.id);
        const f = subGenreFamily(samplerProbeOf(c.id) || '') || '';
        if (!coldSpanFams.has(f)) return tier;
        const [n1, n2] = famTierSeen[f] || [0, 0];
        // The under-sampled tier first; a tie keeps the household name in front, as everywhere else.
        return (tier === 1 ? n1 : n2) * 2 + (tier - 1);
      };
      // A FAMILY'S TURN MUST BUY A SHELF IT HAS NOT SEEN. `famRank` decides which family goes next
      // and nothing below it distinguished a shelf already probed from one never probed, so crime's
      // hard-won turn could be spent on a second psychological thriller while courtroom drama — the
      // shelf the whole span debt exists to reach — stayed unasked. Measured: a session that gave
      // crime four slots still offered courtroom zero times. Only for families that still owe span;
      // the family being deepened is asking a different question, and it needs the SAME shelf again
      // to earn its confirming hit, so it is deliberately exempt.
      const unseenShelfFirst = (c: { id: string }) => {
        const t = samplerProbeOf(c.id) || '';
        const f = subGenreFamily(t) || '';
        if (f === depthFam || spanDebt(f) <= 0) return 0;
        return probe[t] ? 1 : 0;
      };
      const nextUp = [...uncovered].sort((a, b) =>
        (notChosen(a) - notChosen(b)) ||
        // The family pass decides BEFORE the boredom memory, which used to outrank it and undo the
        // whole point: a slasher fan rates the other horror shelves a 2, every one of those counts
        // as a refusal, and horror was therefore pushed behind twelve families he had rated 1 —
        // his own family arrived one film at a time and the quiz ran to the cap. Boredom is a
        // one-question memory for the OPENING (its own note below says so), so it still shuffles
        // the families in the breadth pass, where they all rank equal; it no longer decides which
        // shelf we deepen.
        (famRank(a) - famRank(b)) ||
        (unseenShelfFirst(a) - unseenShelfFirst(b)) ||
        (boredomPenalty(a) - boredomPenalty(b)) ||
        (inLeadFam(a) - inLeadFam(b)) ||
        (eraPenalty(a) - eraPenalty(b)) ||
        (tierPref(a) - tierPref(b)) ||
        (seededRank(sessionId + a.id) - seededRank(sessionId + b.id)));
      // Take the first candidate that survives the taste gate rather than the first candidate
      // outright: when the head of the queue is off-taste, dropping the whole turn skipped that
      // sub-genre's only first look and the read came back one niche off.
      // The gate here is NOT the full rejectsUser: that one refuses a whole family once the family
      // looks cold, and applying it to a first look is what deleted parody from a parody fan's quiz
      // — the shelf was condemned on the evidence of its neighbours. During the sweep only the two
      // judgements we have actually earned apply: a sub-genre they themselves rated low, and the
      // child-safety mode. Everything downstream keeps the full gate.
      const sweepBlocked = (c: { id: string; _genreIds?: number[] }) => {
        if (unsafeForKids(c)) return true;
        const t = samplerProbeOf(c.id);
        return !!t && disliked.includes(t);
      };
      pool = [nextUp.find(c => !sweepBlocked(c)) || nextUp[0]];
      poolSrc = 'sweep';
      nextHint = ''; // sampler movies carry their own term via samplerProbeMap

      // WHEN THE CURATED SHELF RUNS OUT, GO TO THE REAL ONE. The sampler holds a couple of
      // exemplars per sub-genre, and westerns are a single sub-genre — so someone who pointed at
      // westerns got two films and then nothing, while the sweep moved on to musicals. Two films
      // is not "we'll go from there". Once a family the user NAMED has nothing left in the curated
      // set, the next question comes from that family's genre shelf on TMDB, which does not run
      // out. Only for families they asked for; the ordinary sweep is untouched.
      const headFam = subGenreFamily(samplerProbeOf(pool[0]?.id || '') || '') || '';
      if (chosenFams.size && !chosenFams.has(headFam)) {
        const wanted = [...chosenFams][0];
        const famPool = (await fetchFamilyPool(wanted, seen, locale, 12)).filter(c => !rejectsUser(c));
        if (famPool.length) {
          pool = [famPool[Math.floor(Math.random() * famPool.length)]];
          poolSrc = 'chosen-family';
          nextHint = wanted;
        }
      }
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
      // WHICH SUB-GENRE A TAIL ANSWER SCORES. A sampler exemplar carries its own term, but a film
      // resolved from a curated seed list does not — it is looked up by title, so it is absent from
      // samplerProbeMap and termOf() returned null for it. The whole tail of the quiz therefore
      // scored nothing: five slashers rated 5 at question 30 moved the model by exactly zero, and
      // the confirming half of the quiz was decoration. Tag each seed with the term it came from
      // and hand that back as the searchHint once the film is actually chosen.
      // Deliberately NOT applied to famPool/popular: those are a genre shelf and a trending list,
      // and a film's presence on either is no evidence of any sub-genre.
      const tag = <T extends { id: string }>(list: T[], term: string): T[] => {
        for (const c of list) hintOf.set(c.id, term);
        return list;
      };

      const tiers: [string, () => Promise<typeof samplerAll>][] = [
        // 1. Unasked curated exemplars inside the focus family.
        ['inFam', async () => byCover(gate(samplerAll).filter(c => focusFam && famOf(c) === focusFam))],
        // 2. The focus sub-genre's own canonical films.
        // Only HALF the curated list may be spent on questions. A seventy-question quiz burned all
        // eight of a term's canonical films as questions, and the recommendation stage then had
        // nothing of its own left and fell through to the family shelf — a musical fan was handed
        // Goodfellas at 99%. The other half is the answer, not the question.
        ['seeds', async () => focusTerm ? tag(gate(await fetchSeedCandidates(focusTerm, seen, 4)), focusTerm) : []],
        // 3. Its sibling sub-genres — same family, still the right shelf.
        ['kinSeeds', async () => {
          if (!focusFam) return [];
          let out: typeof samplerAll = [];
          for (const t of allSubGenreTerms()) {
            if (out.length >= 8) break;
            if (t === focusTerm || subGenreFamily(t) !== focusFam || disliked.includes(t)) continue;
            out = out.concat(tag(gate(await fetchSeedCandidates(t, seen, 2)), t));
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
            out = out.concat(tag(gate(await fetchSeedCandidates(t, seen, 4)), t));
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
    // Weighted toward what the meter is actually FOR. A traced slasher fan sat at 53% at question
    // 25 with the read long since settled — sweep coverage and raw answer count were holding two
    // thirds of the meter down while the only thing that had changed for twenty questions was the
    // leader getting stronger. The meter then needed nine more questions purely to ramp to the 96
    // completion gate: nine films a customer rated so a progress bar could catch up with what the
    // engine already knew. Leader strength now carries the meter, coverage and count are the
    // background motion they were meant to be.
    const blended = Math.min(0.99, 0.18 * sweepProgress + 0.16 * ratedProgress + 0.63 * leaderStrength + 0.03 * creep);
    // A CONFIRMED lock is genuine high confidence — the leader out-hit its rivals and they were
    // drilled. Holding the blend low after that (sweep coverage is still partial by design once
    // narrowing engages) forced ~14 extra questions of pure ramp before the 96 gate, which is why
    // a sharp taste still ran ~36-46 questions instead of the 15-20 the product targets. The
    // ≤4%/step clamp still applies, so the meter climbs to it smoothly rather than jumping.
    // Floating the meter to 0.7 pre-lock was measured and dropped: it kept the read at 100% and
    // the jumps at zero, but bought no length at all (16.4 questions against 15.8), because the
    // tail is not the ramp — it is the confirming hits the lock itself waits for.
    const confidence = Math.max(0.05, (lockedLove ? Math.max(blended, 0.88) : blended) - contraPenalty);

    // DISPLAY METER: ease the SHOWN percent toward the true confidence by at most 4 points per
    // answer (owner wants smooth 1-4% steps, never a 5→42 jump). The previous shown value
    // round-trips via the x-current-confidence header. Completion is gated on the SHOWN meter
    // (below), so the final step to 100 is also ≤4.
    // The stored session carries the last meter we served, so that is what the ramp continues from.
    // Reading the header first let a client post x-current-confidence: 0.99 and watch the meter go
    // to 95 on its first answer — and since completion is gated on this same displayed meter, that
    // is the first half of forging a finished quiz. The header remains the fallback for a session
    // the server no longer holds, which is the only case it was ever needed for.
    const headerShown = Math.round((parseFloat(req.headers.get('x-current-confidence') || '0') || 0) * 100);
    const prevShown = stored && typeof stored.shown === 'number' ? stored.shown : headerShown;

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
    // Must match the closing step below, or the budget reserves a ramp far longer than the one it
    // will actually take and the quiz starts closing while it still has questions worth asking.
    const stepsNeeded = Math.max(0, Math.ceil((96 - prevShown) / CLOSING_STEP));
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
    // THE EXTRA CONFIRMING HIT, AND WHEN IT IS ALREADY IN HAND. The lock needs LOCK_HITS strong
    // hits; finishing waits for one more, plus one for every contradiction. That extra hit is the
    // difference between "we think it's slasher" and "we know", and it is worth its question when
    // the evidence is merely good. It is not worth it when the evidence is already emphatic: a
    // leader whose every rating was a strict 5, with nothing contradicting it and its close rivals
    // already drilled, does not become more certain on a fourth film — that is the same standard
    // the early-exploit path uses to skip the rest of the sweep. Everything short of that still
    // pays for the extra hit.
    const emphatic = !!lockedLove && lockedLove.avg === 5 && !(lockedLove.contra || 0) &&
      contenders.every(s => s.n >= 2);
    const surgical = !!lockedLove &&
      lockedLove.hi >= LOCK_HITS + (emphatic ? 0 : 1) + (lockedLove.contra || 0);
    // …and the read is not finished while another family is still saying "there is something here"
    // (see `chasingSecondTaste`). The caps still end the quiz; this only spends questions we would
    // otherwise have spent walking shelves the person rated 1.
    const wantFinish = userAsked || mustFinish || (history.length >= MIN_Q && surgical && !chasingSecondTaste);

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
    // Once the read is confirmed the remaining questions exist only to walk the meter up to 96,
    // and at six points a step that is nine films: a traced slasher fan answered questions 26 to
    // 34 while the bar counted 51, 57, 63, 69, 75, 81, 87, 93, 99 and nothing he said could have
    // changed the outcome. Nine films is a third of the quiz spent animating a progress bar.
    // Twenty closes the same gap in three, which still MOVES — the rule this meter exists for is
    // that the number never leaps between two questions while the engine quietly overstates what
    // it knows, and a confirmed lock is exactly the case where it does know.
    const step = wantFinish ? CLOSING_STEP : STEP_UP(history.length);
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
      // THE LAST GATE BEFORE A FILM IS ON SCREEN. rejectsUser() guards the pools, but the pool is
      // not what the child sees — this film is. Two paths reached here ungated: the safety net a
      // few lines above keeps an all-unsafe pool when filtering leaves nothing behind, and the
      // emergency refill below pulls straight from the popular list. Both are checked here, on the
      // resolved film, so no branch can put a horror title in front of a children's profile.
      for (const cand of shuffled.slice(0, 8)) {
        const m = await movieById(cand.id, locale);
        if (!m) continue;
        if (usedTitles.has(titleKey(m.title))) continue;
        if (unsafeForKids(m)) continue;
        if (m.overview && m.overview.trim()) { movie = m; break; }
        bare = bare || m;
      }
      movie = movie || bare;
      if (!movie) {
        for (const cand of await fetchCandidatePool(seen, locale, 10)) {
          const m = await movieById(cand.id, locale);
          if (!m || usedTitles.has(titleKey(m.title)) || unsafeForKids(m)) continue;
          movie = m; break;
        }
      }
      if (movie) {
        // Remember what we asked, so the next request can be checked against it.
        if (stored) {
          stored.served = [...stored.served, movie.id].slice(-200);
          stored.servedTitles = [...stored.servedTitles, titleKey(movie.title)].slice(-200);
          stored.history = history; stored.probe = probe; stored.notSeen = notSeen;
          stored.skipYears = skipYears; stored.shown = shown;
          saveSession(sessionKey, stored);
        }
        movie.trailerId = await getTrailer(movie.id);
        // The chosen film's own sub-genre, so the answer to it scores that sub-genre when it comes
        // back. Only a pool that knows the term sets one; the sampler's own films are already
        // covered by samplerProbeMap and must not be overridden.
        if (!nextHint) nextHint = hintOf.get(movie.id) || '';
        const tasteSummary = lockedLove ? `Confirming: ${lockedLove.t}` : leader ? `Closing in on: ${leader.t}` : 'Mapping your taste…';
        // Whether stopping RIGHT NOW would still produce a recommendation worth having. The quiz
        // already lets anyone stop from question five, but the button says nothing about what they
        // would get, so a tiring user's real choice was between more questions and closing the
        // tab. Against fifty simulated customers that choice is the whole difference: everyone
        // who closed the tab abandoned, and when the same fifty pressed the button instead,
        // abandonment fell from 80% to 16% with the read still correct 98% of the time. The
        // client uses this to offer the exit in words, and only once there is something to offer.
        // SUB-GENRE EVIDENCE ONLY. Letting a strongly-rated FAMILY open the exit as well was
        // measured twice and cost accuracy both times: at three highs it fired around question
        // nine, people took it, and the read fell to 80% correct; even as a late fallback
        // (sixteen answers, five highs) it sat at 94%. Twelve to seventeen questions buy a family,
        // not a shelf, and a family-level guess is the misread this engine exists to prevent. The
        // offer waits for two hits on one sub-genre. Anyone who wants out sooner still has the
        // quiet button from question five — it is their call to make, not ours to encourage.
        // The offer also has to reach the person it was never reaching. Someone who has seen few
        // films answers "didn't see it" to most of what we show, and a skip carries no taste signal
        // — so they never grow a leading sub-genre, never satisfy the condition above, and rode all
        // the way to the 90-film cap with no worded way out. Measured: 90 films shown, 30 actually
        // rated. Once we have shown that many films without the taste settling, the quiz is not
        // going to settle, and saying so is more honest than asking forty more times. The results
        // screen already labels this case as an early stop rather than a finished read.
        const STALLED_SHOWN = 45;
        const readyToFinish = !!lockedLove
          || !!(leader && leader.hi >= LOCK_HITS)
          || (shownCount >= STALLED_SHOWN && history.length >= MIN_Q);
        return NextResponse.json({
          ...baseState, tasteSummary, searchHint: nextHint, poolSrc, readyToFinish,
          isComplete: false, confidenceScore: shown / 100, progressPercent: Math.min(99, shown),
          // No "films still in play" count. It was 50000 × (1 − meter), i.e. the progress bar
          // wearing a number's clothes: the engine has no catalogue of 50,000 candidates and never
          // narrowed one. A figure nobody can back is worse than no figure on a screen that is
          // asking to be trusted with someone's taste.
          currentVectorState: { leadingMicroGenres: [tasteSummary] },
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
    // A genre rejected again and again and never once rated highly is not ambiguous, and pairing
    // it with a genre they DO like must not launder it. The old rule forgave any hated genre as
    // long as the film also carried a loved one, which is how a horror-hating time-travel fan was
    // handed Final Destination: Horror was hated, Thriller was loved, and the film carried both.
    // Three rejections with zero likes is the line — a giallo fan who rates mainstream horror low
    // still rates their own giallo 5s, so Horror keeps a loved hit and stays allowed for them.
    const HARD_REJECT_HITS = 3;
    const hardRejectedGenres = new Set(
      [...hatedGenres].filter(g => (lovedGenreHits[g] || 0) === 0 && (hatedGenreHits[g] || 0) >= HARD_REJECT_HITS),
    );
    // THE LEAD GENRE IS WHAT THE FILM *IS*. A person who rated every animation they were shown a 1
    // and never rated one above 1 was still recommended a film whose PRIMARY genre is Animation —
    // twice more with horror and mystery. Two gaps let it through: hardRejectedGenres wants three
    // rejections and this person had been shown two, and every last-resort tier further down
    // bypasses the candidate filter altogether. So the first genre TMDB lists — the one the film
    // leads with — gets its own, stricter test, and it is applied on every path to the final list.
    const LEAD_REJECT_HITS = 2;
    const leadGenreRejected = (m: { _genreIds?: number[] }) => {
      const lead = genreNames(m._genreIds || [])[0];
      if (!lead) return false;
      return (lovedGenreHits[lead] || 0) === 0 && (hatedGenreHits[lead] || 0) >= LEAD_REJECT_HITS;
    };
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
    // KIDS MODE IS NOT AN OPINION ABOUT TASTE, so it must not live inside the taste filter's
    // exemptions or inside any one tier. It sat below the `onTaste` early return, which is the
    // path that produces the MAIN recommendation pool — a confirmed sub-genre skipped the check
    // entirely — and half the fallback tiers further down build `resolved` without calling isBad
    // at all. The test therefore stands on its own and is applied twice: inside isBad above every
    // exemption, so the candidate pools stay clean, and again on the finished list, where every
    // path converges. Getting this wrong puts an adult film in front of a child, so it is checked
    // where nothing can route around it rather than where the bug was reported.
    const unsafeRecForKids = (m: { _genreIds?: number[] }) => {
      if (!kidsMode) return false;
      const names = genreNames(m._genreIds || []);
      if (names.includes('Horror') || names.includes('Thriller') || names.includes('Crime')) return true;
      // "Animation" covers both Toy Story and The End of Evangelion, and a child's profile was
      // answered with three Gundam films at "99% match". In kids mode a pick has to carry the
      // Family genre — the one label that separates the children's shelf from adult anime.
      return !names.includes('Family');
    };
    // THE ON-TASTE EXEMPTION IS FOR THEIR SHELF, NOT FOR WHATEVER TMDB CALLS SIMILAR TO IT.
    // recommendBySubGenre seeds from two curated titles and then WIDENS with TMDB's own
    // similar/recommended lists, which are ranked by popularity — so a 32-question all-horror quiz
    // was handed Live Free or Die Hard at 95%, and a measured slasher run got Copycat (crime /
    // thriller / mystery). Those films arrived through the same call as the curated ones and
    // inherited the exemption that exists for a completely different case: the giallo fan who rates
    // mainstream horror low and would otherwise have their own locked niche filtered out. Both are
    // served by asking what the film actually IS: a candidate whose genre family matches the term
    // keeps the exemption, one that has drifted to another family is dropped, and one TMDB gives no
    // family for falls through to the ordinary guards.
    const onTasteOf = (m: Rec, term: string): 'keep' | 'drop' | 'unknown' => {
      const fam = subGenreFamily(term);
      const mf = familyOfGenres(m._genreIds);
      if (!fam || !mf) return 'unknown';
      return mf === fam ? 'keep' : 'drop';
    };
    const isBad = (m: Rec, onTasteTerm: string | false = false) => {
      if (askedMovieIds.includes(m.id) || hatedIds.has(m.id)) return true;
      // Recommending a film under a name they were just asked about reads as the engine forgetting
      // the last twenty minutes, whether or not TMDB considers it the same title.
      if (usedTitles.has(titleKey(m.title))) return true;
      if (tokens(m.title).some(w => hatedTokens.has(w))) return true;
      const names = genreNames(m._genreIds || []);
      // Checked before the on-taste exemption: a hard-rejected genre outranks every other reason
      // to keep a candidate, including its own locked sub-genre.
      if (names.some(n => hardRejectedGenres.has(n))) return true;
      // Also before the on-taste exemption: a confirmed sub-genre is not a licence to lead with a
      // genre this person turned down every time they met it.
      if (leadGenreRejected(m)) return true;
      // The safety signal outranks the on-taste exemption for the same reason a hard-rejected
      // genre does: a confirmed sub-genre is not a licence to hand a child an adult film.
      if (unsafeRecForKids(m)) return true;
      if (onTasteTerm) {
        const verdict = onTasteOf(m, onTasteTerm);
        if (verdict === 'drop') return true;   // widened out of their family entirely
        if (verdict === 'keep') return false;  // genuinely their niche — the exemption stands
      }
      if (names.length > 0 && names.some(n => hatedGenres.has(n)) && !names.some(n => lovedGenres.has(n))) return true;
      if (hatedCombos.some(combo => combo.every(g => names.includes(g)))) return true;
      return false;
    };
    // `term` is the sub-genre the candidate came from, when it came from one — a film that IS of
    // their confirmed shelf is judged as such, exactly as it was when it entered the pool.
    const add = (m: Rec | null, term: string | false = false) => {
      if (m && !resolved.some(x => x.id === m.id) && !isBad(m, term)) resolved.push(m);
    };

    // Build the LOVED candidate pool: curated seeds from the confirmed term + any OTHER loved
    // sub-genre (never a disliked term, never a generic popular pool — that's what leaked a
    // hated style like Guardians before). Every candidate is a real, on-taste film.
    const dislikedSet = new Set(disliked);
    // A PERSON CAN HOLD MORE THAN ONE TASTE. The engine resolved a single leading sub-genre and
    // filled all three cards from it, so someone who loves slashers AND heist films AND anime was
    // told they love slashers, three times over. A term earns its own card when it has real hits of
    // its own and nothing contradicting them — two or three of those and the three films come one
    // per taste instead of three from the winner. With only one such term nothing changes.
    // TWO STRONG HITS ON ONE TERM IS THE WRONG PRICE FOR A TASTE THAT IS NOT THE LEADER. The
    // confirmed taste gets drilled until it has them; a second love gets one film per shelf, and
    // the shelves are usually neighbours — a viewer who loves parody rated Airplane! AND This Is
    // Spinal Tap five, which is one emphatic hit on "parody spoof" and one on "mockumentary" and
    // therefore, under the old rule, no second taste at all. Measured: five sessions each shown
    // both slasher and parody films, every one answered on a single axis.
    // The evidence is still two emphatic 5s — it is simply counted across the FAMILY rather than
    // inside one term. Counting a single 5 was tried and reverted the same hour: a parody fan who
    // rated one horror-comedy five was handed Train to Busan, so one stray answer bought a card.
    // Only the family's strongest shelf takes the card, so a second taste costs one of the three,
    // never two.
    const confirmedFam = confirmedTerm ? subGenreFamily(confirmedTerm) : undefined;
    const famHi5: Record<string, number> = {};
    const famHiAll: Record<string, number> = {};
    for (const s of stats) {
      const f = subGenreFamily(s.t); if (!f) continue;
      famHi5[f] = (famHi5[f] || 0) + s.hi5; famHiAll[f] = (famHiAll[f] || 0) + s.hi;
    }
    // Two emphatic 5s across the family, or one 5 that a second strong rating stands behind. Both
    // are two answers; a single 5 with nothing beside it is one, and that is the line.
    const secondTasteFam = (f: string) => (famHi5[f] || 0) >= 2
      || ((famHi5[f] || 0) >= 1 && (famHiAll[f] || 0) >= 2);
    // …OR ONE 5 WITH THE FAMILY AROUND IT RATED COLD. Two answers is the right bar and this is the
    // second answer, read the other way round: a viewer who loves slashers and courtroom drama can
    // never clear the family bar inside crime, because the only crime shelf he likes is courtroom —
    // every other crime film the sweep offers him is a 2 by construction, so the family sits at one
    // 5 forever and all three cards came back slashers. But those 2s are not silence. Rating one
    // shelf 5 and two sibling shelves cold is the owner's own sentence made measurable — "liking
    // Scream does not mean I like all horror, maybe I only like slashers" — and the engine already
    // trusts exactly this reading inside the locked family (`splitTaste`). It is not the single
    // stray 5 that was tried and reverted: that one had no cold siblings behind it, which is
    // precisely what separates a taste from an accident.
    const coldSiblings = (f: string, term: string) =>
      stats.filter(s => s.t !== term && subGenreFamily(s.t) === f && s.n >= 1 && !s.hi && s.avg <= 2).length;
    const shelfLevelTaste = (s: { t: string; hi5: number }, f: string) =>
      // Two, and it has been measured twice. One cold sibling was tried before the sweep fix (17/19)
      // and again after it, when the landscape had changed enough to be worth re-reading: it took
      // the suite to 18/19 by handing a slasher purist Hunter Hunter, a horror film that is not a
      // slasher — the same class as the Train to Busan regression the note above records. One 5 and
      // one cold neighbour is not enough evidence to spend a card on.
      s.hi5 >= 1 && coldSiblings(f, s.t) >= 2;
    const claimedFam = new Set<string>();
    const multiTerms = candidates
      .filter(s => !s.contra && !dislikedSet.has(s.t))
      .sort((a, b) => (a.t === confirmedTerm ? -1 : 0) - (b.t === confirmedTerm ? -1 : 0)
        || b.hi5 - a.hi5 || b.hi - a.hi || b.avg - a.avg)
      .filter(s => {
        if (s.hi >= LOCK_HITS) return true;
        const f = subGenreFamily(s.t);
        if (!f || !confirmedFam || f === confirmedFam) return false;
        if (!secondTasteFam(f) && !shelfLevelTaste(s, f)) return false;
        if (claimedFam.has(f)) return false;   // one card per second taste, not two
        claimedFam.add(f);
        return true;
      })
      .map(s => s.t)
      .slice(0, 3);
    const multiTaste = multiTerms.length >= 2;
    // A term that earns a card has to be in the pool the cards are drawn from — a second taste
    // recognised here but absent from `lovedTerms` reached the screen as an empty slot.
    const lovedTerms = [confirmedTerm, ...multiTerms, ...loved.map(s => s.t)]
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
    // With several tastes to represent, no single term may eat the pool — the first term's eight
    // curated seeds would fill all twelve slots and the other tastes would never reach a card.
    const perTerm = multiTaste ? 4 : 12;
    for (const term of lovedTerms) {
      if (candPool.length >= 12) break;
      let fromTerm = 0;
      // askedMovieIds only covers THIS quiz, so a returning customer with the same taste got the
      // same three films back — visit 3 of a slasher fan repeated two of visit 2's picks. `seen`
      // carries the cross-quiz window (x-recent-ids) as well, which is what makes the second
      // visit feel like the engine remembers them.
      // THE CANON FIRST, TMDB'S WIDENING SECOND. recommendBySubGenre anchors on two curated titles
      // and then widens with TMDB's own similar/recommended lists, which are ranked by popularity —
      // and `depthOf` skips the two most canonical entries for anyone who gave the term an emphatic
      // 5, which is precisely the surgical customer. Those two entries WERE the curated anchors, so
      // the expert's whole pool became the popularity widening: a slasher quiz came back with two
      // 2025 horror releases that are not slashers. The curated list is eight deep, so the expert
      // gets its deeper cuts — Sleepaway Camp rather than Halloween — and the widening is what
      // takes over when the canon runs out, not what replaces it.
      const canon: Rec[] = [];
      for (const c of await fetchSeedCandidates(term, seen, 8)) {
        if (canon.length >= perTerm + depthOf(term)) break;
        const m = await movieById(c.id, locale);
        if (m) canon.push(m);
      }
      const seeds = [...canon.slice(depthOf(term)), ...await recommendBySubGenre(term, seen, locale, 8)];
      for (const m of seeds) {
        if (candPool.length >= 12 || fromTerm >= perTerm) break;
        if (!candPool.some(x => x.id === m.id) && !isBad(m, term)) {
          candPool.push(m); termOfPick.set(m.id, term); fromTerm++;
        }
      }
    }
    // One card per confirmed taste, chosen before anything else can fill the screen. The director
    // below still runs for whatever is left over — with three tastes it has nothing to do, which is
    // the point: it picks the best match for ONE taste and that is not what this user has.
    // A SECOND TASTE GETS ONE CARD, SO IT HAS TO BE SQUARELY ON THE SHELF. `candPool` holds each
    // term's curated canon AND the TMDB widening behind it, and the widening is ranked by
    // popularity, not by shelf: the parody slot came back as Celebrity — a Woody Allen satire that
    // is not a parody — and the one chance to show the viewer his second taste was spent on it.
    // The widening is right for the CONFIRMED taste, which has two more cards to be broad with.
    // A single card has no room to be approximately right, so it is drawn from the curated seeds
    // only, and falls back to the pool if the canon is exhausted rather than leaving the slot empty.
    const canonIds = new Set<string>();
    if (multiTaste) {
      for (const term of multiTerms) {
        for (const c of await fetchSeedCandidates(term, seen, 8)) canonIds.add(c.id);
      }
      for (const term of multiTerms) {
        if (resolved.length >= 3) break;
        const ofTerm = (m: Rec) => termOfPick.get(m.id) === term && !resolved.some(x => x.id === m.id);
        add(candPool.find(m => ofTerm(m) && canonIds.has(m.id))
          || candPool.find(ofTerm) || null, term);
      }
    }
    // AI TASTE DIRECTOR (gemma2): picks the final 3 FROM the real candidate pool, steered by
    // the user's actual loved/hated FILMS — so it rejects a hated franchise/studio/style the
    // coarse genre filter can't (e.g. "hated Marvel/DC → never Guardians of the Galaxy").
    // Grounded (chooses only from the supplied list, no hallucination); null → deterministic.
    const lovedTitles = history.filter(h => h.rating >= HI).map(h => h.title);
    const hatedTitles = history.filter(h => h.rating <= LO).map(h => h.title);
    const byTitle = new Map(candPool.map(m => [m.title, m] as const));
    // Only when there is a card left to fill. Three confirmed tastes already used all three, and
    // the director is an LLM round-trip on the slowest request in the quiz.
    const directed = resolved.length < 3
      ? await directRecs({ candidates: candPool.map(m => m.title), lovedTitles, hatedTitles, term: confirmedTerm || 'this taste', mock })
      : null;
    if (directed) for (const t of directed) {
      if (resolved.length >= 3) break;
      const m = byTitle.get(t) || null;
      add(m, (m && termOfPick.get(m.id)) || false);
    }
    // deterministic order of the same safe pool if the director under-filled.
    for (const m of candPool) { if (resolved.length >= 3) break; add(m, termOfPick.get(m.id) || false); }
    // The family's TMDB shelf. A one-term family (western) can have every curated seed used up
    // AS A QUESTION by the time the quiz ends — a western fan reached the results screen with
    // zero recommendations on it, which is the worst possible ending. This shelf is effectively
    // unlimited and still squarely on-taste.
    if (resolved.length < 3 && confirmedTerm) {
      const fam = subGenreFamily(confirmedTerm);
      if (fam) for (const c of await fetchFamilyPool(fam, seen, locale, 16)) {
        if (resolved.length >= 3) break;
        const m = await movieById(c.id, locale);
        if (m && !isBad(m, confirmedTerm)) add(m, confirmedTerm);
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
          if (isBad(m, term) || resolved.some(x => x.id === m.id)) continue;
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
        if (names.some(n => hardRejectedGenres.has(n)) || leadGenreRejected(m)) continue;
        if (names.some(n => hatedGenres.has(n)) && !names.some(n => lovedGenres.has(n))) continue;
        if (hatedCombos.some(combo => combo.every(g => names.includes(g)))) continue;
        resolved.push(m);
      }
    }

    // A user who dislikes nearly everything ends with every genre in the hated set, so each
    // guarded tier above rejects its whole pool and the results screen came back EMPTY after a
    // 34-question quiz — seen in a browser run. Three well-reviewed films they never rated low
    // is a poor read but an honest one; an empty screen is neither.
    //
    // This is the floor, and a floor that can reject its whole pool is not a floor. When the
    // lead-genre guard was added to every tier it was added here too, and that took a
    // rate-everything-1 quiz down to a single film: for that person EVERY lead genre has two
    // rejections and no likes, so the guard rejected the entire catalogue. Dropping the guard
    // outright is the opposite mistake — it hands the first film that comes back, which is how a
    // rejected animation led a recommendation again. So the pool is walked twice: once respecting
    // the guard, and only then again without it. A person who rejected everything still gets three
    // films, and everyone else still gets the guard, because the second pass never runs for them.
    if (resolved.length < 3) {
      // Eighty rather than forty: the first pass here is the one that still respects the lead-genre
      // guard, and a narrow pool is what pushes a session into the second pass. A measured run had
      // an animation-lead film reach someone who had rejected animation purely because forty
      // popular candidates did not contain three they had not already seen.
      const pool = await fetchCandidatePool(seen, locale, 80);
      for (const respectTaste of [true, false]) {
        if (resolved.length >= 3) break;
        for (const c of pool) {
          if (resolved.length >= 3) break;
          const m = await movieById(c.id, locale);
          if (!m || hatedIds.has(m.id) || resolved.some(x => x.id === m.id)) continue;
          // The first pass has to honour BOTH guards, not just the lead-genre one. Honouring only
          // the lead genre let a horror film reach someone who rated every horror film they were
          // shown a one, because horror sat second in that film's genre list. The set of genres
          // this person rejected outright is the stronger signal of the two; a film carrying any
          // of them has no place here while any alternative exists.
          if (respectTaste) {
            if (leadGenreRejected(m)) continue;
            if (genreNames(m._genreIds || []).some(n => hardRejectedGenres.has(n))) continue;
          }
          resolved.push(m);
        }
      }
    }

    // A TMDB blip can leave every source above empty, which showed an empty results screen at
    // the end of a long quiz. One short retry against the curated seeds (title lookups are
    // week-cached, so this usually succeeds even mid-outage) before we give up.
    if (!resolved.length) {
      await new Promise(r => setTimeout(r, 400));
      // Films this retry found but set aside because they carry a genre this person rejected. They
      // are used only if the preferred pass leaves us with nothing at all — see the note below.
      const lastDitch: typeof resolved = [];
      // A user the engine never read at all — "Eclectic taste" — has no loved terms AND no
      // confirmed term, so this loop used to iterate over an empty array and do nothing. That is
      // exactly the person most likely to reach it: someone who rejected or skipped every film.
      // A driven run reproduced the empty results screen once in two attempts. Broad terms give
      // the retry something to look through when the taste model has nothing to offer.
      const terms = lovedTerms.length ? lovedTerms
        : confirmedTerm ? [confirmedTerm]
        : ['psychological thriller', 'coming-of-age', 'heist'];
      for (const term of terms) {
        if (resolved.length >= 3) break;
        for (const m of await recommendBySubGenre(term, [], locale, 5)) {
          if (resolved.length >= 3) break;
          // Same reasoning as the floor above, and the same two-pass shape: prefer a film that does
          // not lead with a rejected genre, but never return an empty screen to protect that
          // preference. This retry only runs when every earlier source came back with nothing.
          if (resolved.some(x => x.id === m.id) || hatedIds.has(m.id)) continue;
          const rejectedHere = leadGenreRejected(m)
            || genreNames(m._genreIds || []).some(n => hardRejectedGenres.has(n));
          if (rejectedHere) { lastDitch.push(m); continue; }
          resolved.push(m);
        }
      }
      // Nothing survived the preference. An imperfect film beats an empty results screen.
      for (const m of lastDitch) {
        if (resolved.length >= 3) break;
        if (!resolved.some(x => x.id === m.id)) resolved.push(m);
      }
    }

    // THE FLOOR. Every tier above can legitimately come back empty for someone who rejected or
    // skipped everything they were shown: the pools exclude what they have seen, and what is left
    // is what they rated low. At that point the honest thing is a well-known film they never
    // actually turned down — the popular pool WITHOUT the seen-exclusion, filtered only by the
    // films they rated low themselves. An empty results screen after sixty-eight questions is the
    // one outcome this product must never produce.
    if (!resolved.length) {
      for (const c of await fetchCandidatePool([], locale, 40)) {
        if (resolved.length >= 3) break;
        const m = await movieById(c.id, locale);
        if (m && !hatedIds.has(m.id) && !leadGenreRejected(m) && !resolved.some(x => x.id === m.id)) resolved.push(m);
      }
    }

    // Name every taste the picks were drawn from, or the screen claims one taste while showing three.
    const tasteSummary = multiTaste ? `Loves ${multiTerms.join(', ')}`
      : confirmedTerm ? `Loves ${confirmedTerm}` : 'Eclectic taste';
    // The final screen used to recompute its percentage from scratch and ignore what the user had
    // just been shown: a quiz sitting at 99% ended on 71%, one at 35% ended on 100%. Whatever the
    // engine believes, the number can only move by the same small step as every other answer — it
    // is the same meter, on the same screen, one moment later. A confirmed lock earns the last
    // step to 100; running out of questions does not.
    const finalPercent = lockedLove
      ? Math.min(100, Math.max(prevShown, 96))
      : Math.min(prevShown + 4, Math.max(prevShown, Math.max(60, Math.min(95, Math.round(confidence * 100)))));

    const uniq: typeof resolved = [];
    const seenRec = new Set<string>();
    // WHERE EVERY TIER MEETS. The ladder above has eight ways to fill `resolved` and four of them
    // push straight past isBad to guarantee three films, so a per-tier safety check is a check
    // that the next fallback undoes. This line is the one place all of them pass through.
    for (const m of resolved) { if (!seenRec.has(m.id) && !unsafeRecForKids(m)) { seenRec.add(m.id); uniq.push(m); } }
    // Filtering can legitimately empty the list — the tiers that ignore isBad are exactly the ones
    // that reach for the popular pool — and an empty results screen is the one ending this product
    // must not produce. The children's shelf answers both: TMDB's animation/family genres are deep
    // enough that a child always ends the quiz with three films they are allowed to watch.
    if (kidsMode && uniq.length < 3) {
      for (const c of await fetchFamilyPool('animation', seen, locale, 20)) {
        if (uniq.length >= 3) break;
        const m = await movieById(c.id, locale);
        if (!m || seenRec.has(m.id) || hatedIds.has(m.id) || unsafeRecForKids(m)) continue;
        seenRec.add(m.id); uniq.push(m);
      }
    }
    const picks = uniq.slice(0, 3);
    for (const p of picks) p.trailerId = await getTrailer(p.id);

    // The local model (gemma2) writes the natural-language reason in the user's language —
    // this is the customer-facing "answer" the LLM provides. Generated in parallel over the
    // already-chosen films, so it cannot affect the surgical selection.
    const yearOf = (p: typeof picks[number]) => (p.originalDetails || '').match(/(\d{4})/)?.[1];
    // Availability is fetched alongside the reasons — a rec the user cannot act on tonight is
    // not a recommendation. Region is IL; a miss just omits the row.
    const watch = await Promise.all(picks.map(p => getWatchProviders(p.id, 'IL')));
    // The person, not only the film. Their highest-rated titles go into the prompt and the reason
    // has to name one, so the sentence says why THIS viewer gets THIS film. Best-rated first, so a
    // 5★ anchors the sentence rather than whichever 4 happened to come first in the quiz.
    const anchorTitles = history.filter(h => h.rating >= HI)
      .sort((a, b) => b.rating - a.rating).map(h => h.title);
    // The empty string, deliberately: passing the Hebrew words "הסגנון שלך" as the TERM produced
    // "בחירה קלאסית ומדויקת בסגנון הסגנון שלך" on a shipped results card, because the template
    // wraps whatever it is given in "בסגנון ...". With no term the reason is written around the
    // user's own films instead.
    // A DIFFERENT ANCHOR FILM PER PICK. All three calls run in parallel, so no one of them can see
    // what the others wrote — and given the same list of loved films they all reached for the same
    // one. A measured results screen read "כי כמו בפני צלקת…" three times, once per card: three
    // recommendations, one sentence, which is exactly the template feel the reason exists to avoid.
    // Rotating the list gives each card a different film to hang on without making the calls
    // sequential, which would add seconds to the slowest request in the quiz.
    const rotated = (i: number) =>
      anchorTitles.length ? anchorTitles.slice(i).concat(anchorTitles.slice(0, i)) : anchorTitles;
    const reasons = await Promise.all(picks.map((p, i) =>
      recReason({
        title: p.title, year: yearOf(p), term: termOfPick.get(p.id) || confirmedTerm || '',
        locale, mock, genres: genreNames(p._genreIds || []), overview: p.overview,
        loved: rotated(i), hated: hatedTitles, variant: i,
      })));
    // Three cards on one screen carrying the identical sentence read as a template rather than a
    // recommendation, and a two-word reason reads as a bug. Either way the fallback — which names
    // the film itself and one of theirs — is a better card than the repeat.
    // Dedup on the whole string is not enough. Two cards opening "אם אהבת את …" with different film
    // names are two different strings and one sentence, and that is what a reader sees: the same
    // card twice. Asking the model for a different angle per card gets it most of the time and not
    // always, so the guarantee lives here rather than in the prompt — a repeated OPENING is treated
    // exactly like a repeated reason, and falls back to the template, whose shapes differ by index.
    const opening = (t: string) => t.trim().replace(/["'״]/g, '').split(/\s+/).slice(0, 2).join(' ');
    const usedReasons = new Set<string>();
    const usedOpenings = new Set<string>();
    const finalReasons = reasons.map((r, i) => {
      const ok = r && r.length >= 40 && !usedReasons.has(r) && !usedOpenings.has(opening(r));
      const text = ok ? r : recReasonFallback({
        title: picks[i].title, term: termOfPick.get(picks[i].id) || confirmedTerm || '',
        locale, loved: rotated(i), variant: i,
      });
      usedReasons.add(text);
      usedOpenings.add(opening(text));
      return text;
    });

    const finalMovies = picks.map((p, i) => ({
      id: `res_${p.id}`, title: p.title,
      // A hardcoded 99% sat next to a 60% meter on the same screen for a user the engine had not
      // understood. The badge now says what the engine actually believes.
      matchScore: Math.max(60, Math.round((lockedLove ? 99 : Math.min(95, confidence * 100)) - i * 4)),
      posterUrl: p.posterUrl, trailerId: p.trailerId, overview: p.overview,
      // The quiz card shows "ORIGINAL TITLE · YEAR" under every film; the results card showed the
      // Hebrew name alone. "הצלצול" is either the 1998 Japanese film or the 2002 American one, and
      // the person is meant to go and watch it tonight — they have to know which one they were
      // handed. The data was already on the pick and simply was not passed on.
      originalDetails: p.originalDetails,
      _genreIds: p._genreIds,
      reason: finalReasons[i],
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
    //
    // AND IF WE CANNOT SIGN, THE FILMS STILL SHIP. The signer throws in production when
    // SESSION_SECRET is unset, which is the correct answer for the SECRET — never fall back to a
    // known string — but it was the whole response's answer too: a run against the production
    // build died with a 500 at question 35, after the person had answered thirty-five films. The
    // token is a receipt for XP; the recommendation is the product. Failing to mint the receipt
    // must not destroy the thing it is a receipt for. No token still means no grant downstream,
    // so nothing is loosened; the misconfiguration is logged loudly instead of silently.
    let proofToken: string | undefined;
    if (isVerified(sessionKey)) {
      try {
        proofToken = signSessionState({
          sessionId,
          totalAnswers: history.length, // real ratings only — NOT_SEEN never counts
          affinities: subGenreVector,
          completedAt: Date.now(),
        });
      } catch (e) {
        console.error('[brain] could not sign the completion token — the quiz still returns its ' +
          'films, but this session cannot earn XP. Set SESSION_SECRET.', e);
      }
    }

    return NextResponse.json({
      ...baseState, tasteSummary,
      // ONE NUMBER, NOT TWO. confidenceScore was computed on its own and came back as a flat 1
      // whenever the taste locked, while progressPercent — the meter the person had been watching
      // all quiz — ended on 96. Two different answers to "how sure are you" on the same screen,
      // and every consumer of the payload had to guess which one meant it. The meter is the
      // answer; the score is the same figure on a 0–1 scale.
      isComplete: true,
      confidenceScore: finalPercent / 100,
      progressPercent: finalPercent,
      userAffinities: subGenreVector,
      currentVectorState: { leadingMicroGenres: [tasteSummary] },
      currentQuestion: null, finalMovies, proofToken,
    }, { status: 200 });
  } catch (error) {
    // The exception text used to be echoed to the caller, which handed an attacker the internal
    // shape of the route. It stays in the server log where it belongs.
    console.error('[brain] ', error);
    return NextResponse.json({ error: 'Brain error' }, { status: 500 });
  }
}
