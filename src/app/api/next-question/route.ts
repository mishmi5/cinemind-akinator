import { NextResponse } from 'next/server';
import type { AnswerPayload, SessionState, MovieContext } from '@/types';
import { sendTelegramAlert } from '@/lib/telegram';
import { checkRateLimit } from '@/lib/rateLimit';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const TMDB_API_KEY = process.env.TMDB_API_KEY;

const GENRE_MAP: Record<number, { name: string, egg: 'oscar' | 'blood' | 'wazzap' | 'matrix' }> = {
  28: { name: 'אקשן', egg: 'oscar' }, 12: { name: 'הרפתקאות', egg: 'oscar' }, 16: { name: 'אנימציה', egg: 'oscar' }, 
  35: { name: 'קומדיה', egg: 'wazzap' }, 80: { name: 'פשע', egg: 'oscar' }, 18: { name: 'דרמה', egg: 'oscar' },
  14: { name: 'פנטזיה', egg: 'oscar' }, 27: { name: 'אימה', egg: 'blood' }, 9648: { name: 'מסתורין', egg: 'blood' },
  878: { name: 'מדע בדיוני', egg: 'matrix' }, 53: { name: 'מתח', egg: 'blood' }
};

async function generateDynamicQuestion(title: string, overview: string, locale: string = 'he'): Promise<string> {
  try {
    const prompt = locale === 'en' 
      ? `Create a hilarious, crazy, and brilliant "yes/no/stars" question about the movie "${title}".
Movie overview for context: ${overview}.
The question will be shown in a lighthearted and sarcastic movie quiz app. The goal is to make the user laugh at the twisted description of the movie when they answer.
Example: "Would you go with the flow to watch a movie where [something messed up from the plot]? How many stars would you give to such stupidity?"
Must follow:
1. Very short (1 to 2 sentences).
2. Sarcastic humor, light, and stupid in a good way.
3. No quotes and no intros - just the question!`
      : `צור שאלת "כן/לא/כוכבים" קורעת מצחוק, מטורללת וגאונית לגבי הסרט "${title}". 
תקציר הסרט לעזרתך: ${overview}.
השאלה תוצג באפליקציית חידון קולנוע קלילה ועוקצנית. המטרה היא לגרום למשתמש לצחוק מהתיאור העקום של הסרט כשהוא עונה.
דוגמה לאיך זה צריך להיראות: "היית זורם לראות סרט שבו [משהו דפוק ומצחיק מהעלילה]? כמה כוכבים תיתן לטמטום כזה?"
חובה:
1. קצר מאוד (משפט אחד עד שניים).
2. הומור עוקצני, קליל, ומטומטם בקטע טוב.
3. בלי מרכאות ובלי הקדמות - רק השאלה נטו!`;

    const { text } = await generateText({
      model: openai('gpt-4o'),
      prompt,
      temperature: 0.9,
    });
    return text.trim();
  } catch (error) {
    const fallbackTemplatesHe = [
      `בוא נראה, כמה כוכבים היית נותן ל"${title}"? (רמז: זה סרט, לא מדע טילים)`,
      `תכלס, היית זורם על סרט כמו "${title}" או שזה בזבוז פופקורן?`,
      `אומרים ש-"${title}" הוא יצירת מופת. או קשקוש מוחלט. מה הדירוג שלך?`,
      `אם היו מכריחים אותך לראות את "${title}", כמה כוכבים היית נותן לו מהרגע שיצאת מהשוק?`,
      `נניח שאתה תקוע במעלית. ויש שם טלוויזיה. שמשדרת את "${title}". היית רואה?`
    ];
    const fallbackTemplatesEn = [
      `Let's see, how many stars would you give "${title}"? (Hint: it's a movie, not rocket science)`,
      `Honestly, would you flow with a movie like "${title}" or is it a waste of popcorn?`,
      `They say "${title}" is a masterpiece. Or total garbage. What's your rating?`,
      `If you were forced to watch "${title}", how many stars would you give it after recovering from the shock?`,
      `Suppose you're stuck in an elevator. There's a TV playing "${title}". Would you watch?`
    ];
    const pool = locale === 'en' ? fallbackTemplatesEn : fallbackTemplatesHe;
    return pool[Math.floor(Math.random() * pool.length)];
  }
}

// Exploration pool lives in src/lib/engine/baselinePool.ts — 12 taste buckets ×
// 2-3 TMDB-verified candidates. Per-session rotation gives every quiz full
// genre coverage (accuracy) with a different movie mix and order (variety).
// Old hardcoded pool had stale poster paths that rendered WRONG artwork
// (Se7en displayed Detective Pikachu's poster).
import { pickBaselineMovie, fullBaselinePool } from '@/lib/engine/baselinePool';
import { nichesForKeywords, nicheKey, isNicheKey, NICHE_HE } from '@/lib/engine/subGenres';

// ---- Sub-genre (niche) layer: see TASTE-FORMULA.md §1-2 ----
// Keywords per movie are fetched once and cached for the server's lifetime;
// the niche list rides MovieContext._niches → client → answer payload.
// Fire-and-forget poster warm-up: kick the TMDB image into Next's data cache
// the moment a movie is selected, so when the browser requests /api/poster a
// second later the bytes are already local. Cold TMDB image fetches for
// obscure titles can exceed 8s — users see a placeholder and churn.
function warmPoster(posterUrl: string) {
  const m = posterUrl.match(/path=(\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp))/);
  if (!m) return;
  fetch(`https://image.tmdb.org/t/p/w500${m[1]}`, { next: { revalidate: 31536000 } }).catch(() => {});
}

// Reverse lookup niche -> TMDB keyword id (resolved once via /search/keyword,
// cached for the server lifetime). Used to inject niche-true candidates into
// the recommendation pool with OR semantics (id1|id2) — AND would intersect
// the stream to nothing, the same starvation mode as over-eager without_genres.
const keywordIdCache = new Map<string, number | null>();
async function keywordIdForNiche(niche: string): Promise<number | null> {
  if (!TMDB_API_KEY) return null;
  if (keywordIdCache.has(niche)) return keywordIdCache.get(niche)!;
  try {
    const q = encodeURIComponent(niche.replace(/-/g, ' '));
    const res = await fetch(`https://api.themoviedb.org/3/search/keyword?api_key=${TMDB_API_KEY}&query=${q}`, { next: { revalidate: 604800 } });
    if (!res.ok) { keywordIdCache.set(niche, null); return null; }
    const data = await res.json();
    const id = data.results?.[0]?.id ?? null;
    keywordIdCache.set(niche, id);
    return id;
  } catch { keywordIdCache.set(niche, null); return null; }
}

const nicheCache = new Map<string, string[]>();
async function getNichesForMovie(tmdbId: string): Promise<string[]> {
  if (!TMDB_API_KEY || !/^\d+$/.test(tmdbId)) return [];
  const cached = nicheCache.get(tmdbId);
  if (cached) return cached;
  try {
    const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/keywords?api_key=${TMDB_API_KEY}`, { next: { revalidate: 86400 } });
    if (!res.ok) return [];
    const data = await res.json();
    const niches = nichesForKeywords((data.keywords || []).map((k: any) => k.name));
    nicheCache.set(tmdbId, niches);
    return niches;
  } catch { return []; }
}

// Recommendation score — TASTE-FORMULA.md §4. Niches weigh double: that's
// where individuality lives. Hard negative gate kills anything the user
// actively rejected.
function scoreMovieForUser(movie: MovieContext, aff: Record<string, number>, ignoreGate: boolean = false): number {
  let s = 0;
  (movie._genreIds || []).forEach((g, idx) => {
    const a = aff[g.toString()] || 0;
    if (!ignoreGate && a <= -4) { s = -Infinity; return; }
    const idf = GENRE_IDF[g.toString()] ?? 1;
    s += a * (idx === 0 ? 1 : 0.5) * idf;
  });
  if (s === -Infinity) return s;
  (movie._niches || []).forEach(n => { s += (aff[nicheKey(n)] || 0) * 2; });
  s += ((movie.rating || 7) - 7) * 0.3; // quality nudge
  return s;
}

// Top taste axes in Hebrew/English for personalized paywall copy.
function topTasteAxes(aff: Record<string, number>, locale: string, n: number = 3): string[] {
  const entries = Object.entries(aff)
    .filter(([k, v]) => k !== 'General' && v >= 2)
    .sort((a, b) => b[1] - a[1]);
  const names: string[] = [];
  for (const [k] of entries) {
    if (names.length >= n) break;
    if (isNicheKey(k)) {
      const niche = k.slice(2);
      names.push(locale === 'he' ? (NICHE_HE[niche] || niche) : niche.replace(/-/g, ' '));
    } else {
      const g = GENRE_MAP[parseInt(k, 10)];
      if (g) names.push(locale === 'he' ? g.name : (TMDB_GENRES_EN[k] || ''));
    }
  }
  return names.filter(Boolean);
}
const TMDB_GENRES_EN: Record<string, string> = {
  '28': 'Action', '12': 'Adventure', '16': 'Animation', '35': 'Comedy', '80': 'Crime',
  '18': 'Drama', '10751': 'Family', '14': 'Fantasy', '27': 'Horror', '9648': 'Mystery',
  '10749': 'Romance', '878': 'Sci-Fi', '53': 'Thriller'
};

// Genre informativeness (IDF): Action/Drama/Thriller tag nearly every blockbuster,
// so each occurrence carries little information about personal taste; Mystery,
// Animation, Romance or Fantasy on a movie is a much stronger taste statement.
// Without this, a fantasy lover who 5-stars fantasy-action blockbusters drifts
// into "Action" purely because Action is the most over-represented genre.
const GENRE_IDF: Record<string, number> = {
  '28': 0.85,   // Action — on almost everything
  '18': 0.9,    // Drama — ubiquitous
  '53': 0.9,    // Thriller — ubiquitous
  '80': 0.95,   // Crime
  '35': 0.95,   // Comedy
  '12': 1.05,   // Adventure
  '878': 1.05,  // Sci-Fi
  '27': 1.05,   // Horror
  '10751': 1.05,// Family
  '9648': 1.15, // Mystery — rare, highly informative
  '16': 1.1,    // Animation
  '10749': 1.1, // Romance
  '14': 1.1,    // Fantasy
};

// Latent-taste inference (the "serendipity" layer): a user who strongly likes BOTH
// Crime and Thriller — more than raw Action — is statistically a whodunit lover even
// if no pure Mystery title was ever shown. Surface that hidden axis so Mystery
// recommendations can reach them. 0.9× keeps the inferred signal just under the
// evidence that produced it (inference must never outrank observation).
function inferLatentAffinities(aff: Record<string, number>) {
  const crime = aff['80'] || 0, thriller = aff['53'] || 0, action = aff['28'] || 0;
  const minCT = Math.min(crime, thriller);
  if (minCT > action && minCT >= 4) {
    aff['9648'] = Math.max(aff['9648'] || 0, Math.max(crime, thriller) * 0.9);
  }
}

// ── Beta-Binomial genre serving weight (TASTE-FORMULA.md §8) ──────────────────
// w_g = (N_g − S_g + 2)/(N_g + 3): the exposure-adjusted P(seen) for a genre,
// where N_g = times the genre was SERVED and S_g = times it was SKIPPED. This is
// the posterior mean of a Beta(2,1) prior over "user has seen this genre" — it
// starts at 0.67 (gentle optimism), rises toward 1 for genres the user always
// rates, and decays CONTINUOUSLY toward 0 for genres they keep skipping. It
// replaces the brittle binary "without_genres after 3 skips": a skip-rate signal,
// not a cliff. NOT_SEEN is MCAR for taste but MAR for exposure — it tells us
// nothing about preference yet everything about what to stop showing.
type GenreStats = Record<string, { n: number; s: number }>;
function betaWeight(stats: GenreStats, genreId: string): number {
  const e = stats[genreId];
  if (!e) return 2 / 3; // prior mean, unseen genre
  return (e.n - e.s + 2) / (e.n + 3);
}
// P(seen) of a whole movie = the weakest of its genres' weights. One reliably
// skipped genre on a movie is enough to make the whole title a likely skip — we
// gate on the min, not the mean, so a niche-but-disliked tag can't ride in on a
// popular co-genre.
function movieSeenProb(stats: GenreStats, ids?: number[]): number {
  if (!ids || ids.length === 0) return 2 / 3;
  return Math.min(...ids.map(g => betaWeight(stats, g.toString())));
}
// Confidence GAIN of asking about a movie (TASTE-FORMULA.md §10) — the akinator
// move. Serving is driven by what most advances "knowing the user", in priority:
//   • CONFIRM an axis measured exactly once (a single vote could be a fluke / just
//     one sub-genre) — applies to likes AND dislikes (we must be SURE you hate
//     horror, not just that one film, before we stop showing it).
//   • RESOLVE a liked genre whose sub-genre is still unknown — serve a DIFFERENT
//     niche of it (loved Scream → try a supernatural horror: slasher or horror?).
//   • COVER a genre never measured.
//   • De-prioritize axes already pinned, and CONFIRMED-hated genres (n≥2, disliked)
//     are pushed right down — those are settled, stop spending questions on them.
function nicheIsNew(nicheObs: ObsStore, niches?: string[]): boolean {
  return (niches || []).some(nk => (nicheObs[nicheKey(nk)]?.n ?? 0) < CONFIRM_MIN_N);
}
function confidenceGain(m: MovieContext, genreObs: ObsStore, nicheObs: ObsStore): number {
  let gain = 0;
  let allConfirmedHate = (m._genreIds || []).length > 0;
  (m._genreIds || []).forEach(g => {
    const o = genreObs[g.toString()];
    if (!o) { gain += 1.0; allConfirmedHate = false; return; }            // new axis
    const m_ = axisMean(o);
    const confirmedHate = o.n >= CONFIRM_MIN_N && m_ <= -MIN_OPINION;
    if (!confirmedHate) allConfirmedHate = false;
    if (o.n === 1) gain += 1.6;                                           // confirm a fluke
    else if (axisPinned(o) >= 0.7) gain += 0.1;                          // already known
    else gain += 0.7;                                                     // measured, not yet pinned
  });
  // Sub-genre resolution bonus when the movie carries a not-yet-confirmed niche.
  if (nicheIsNew(nicheObs, m._niches)) gain += 0.5;
  if (allConfirmedHate) gain *= 0.05;                                     // settled dislike — skip
  return gain;
}
// Pick the live question that most advances confidence; sample from the top few to
// keep quizzes varied. P(seen) still gently down-weights titles the user likely
// hasn't seen (Beta-Binomial §8).
function pickLiveCandidate(
  cands: MovieContext[], genreObs: ObsStore, nicheObs: ObsStore, stats: GenreStats
): MovieContext {
  const ranked = cands
    .map(m => ({ m, score: confidenceGain(m, genreObs, nicheObs) * (0.5 + 0.5 * movieSeenProb(stats, m._genreIds)) }))
    .sort((a, b) => b.score - a.score);
  const topK = ranked.slice(0, Math.min(4, ranked.length));
  return topK[Math.floor(Math.random() * topK.length)].m;
}

// ── v12 confidence model: consistency × decisiveness × coverage × resolution ──
// Per-axis observation store. We record the RAW signed strength of every vote on
// every genre/niche the movie carried — NOT the polarity-amplified affinity. Raw
// values are what let us measure AGREEMENT: two +2 votes on Action agree (low
// variance → confident); a +2 then a −2 contradict (high variance → the model
// must NOT be confident yet and should ask again). userAffinities still drives
// serving/recs; ObsStore drives ONLY how sure we are.
type Obs = { n: number; sum: number; sq: number };
type ObsStore = Record<string, Obs>;
function recordObs(store: ObsStore, key: string, v: number) {
  const e = store[key] || { n: 0, sum: 0, sq: 0 };
  e.n += 1; e.sum += v; e.sq += v * v; store[key] = e;
}
function axisMean(o: Obs): number { return o.n ? o.sum / o.n : 0; }
function axisSE(o: Obs): number {
  if (o.n < 1) return 1;
  const m = o.sum / o.n;
  const variance = Math.max(0, o.sq / o.n - m * m);
  return Math.sqrt(variance) / Math.sqrt(o.n); // standard error of the mean
}

// Tunables (TASTE-FORMULA.md §10). Deliberately demanding: the owner wants the
// meter to mean "the system actually knows me", never "3 decisive clicks".
const MIN_OPINION = 1.0;     // |mean| ≥ this counts as a real like/dislike axis
const DECISIVE_REF = 2.0;    // |mean| at which decisiveness saturates (a clean 1★/5★)
const COVERAGE_TARGET = 5;   // distinct strong axes (likes AND dislikes) for full coverage
const CONFIRM_MIN_N = 2;     // an axis measured once is a fluke until re-confirmed
const PINNED_NICHE_REF = 2;  // pinned sub-genres needed for full resolution credit

// How sharply a single axis is "pinned": strong opinion (decisive) + repeated &
// agreeing (consistent). A one-shot observation is hard-capped — loving ONE horror
// movie cannot pin "loves horror" (it may be only the slasher sub-genre).
function axisPinned(o: Obs): number {
  const m = Math.abs(axisMean(o));
  const decisive = Math.min(1, m / DECISIVE_REF);
  if (o.n < CONFIRM_MIN_N) return 0.3 * decisive;          // unconfirmed → capped
  const consistent = 1 / (1 + axisSE(o) * 1.5);            // low variance → →1
  return decisive * consistent;
}

// Overall confidence the model "knows" the user — the % meter and the stop signal.
// REQUIRES, all at once:
//  • COVERAGE — opinions across several genres, likes AND dislikes (a 3-question
//    one-genre profile scores low no matter how decisive — fixes "70% in 3 Q").
//  • per-axis CONSISTENCY + DECISIVENESS (axisPinned).
//  • RESOLUTION — loving a genre is only "known" once the sub-genre is identified;
//    a profile whose niche layer is pinned (slasher, not just "horror") earns the
//    full resolution multiplier, an un-resolved broad-genre-only profile is capped.
function computeConfidence(genreObs: ObsStore, nicheObs: ObsStore): number {
  // A "strong axis" is a real, re-confirmed opinion: |mean| past the opinion floor
  // AND measured at least twice (one observation is a fluke — possibly just one
  // sub-genre, not the whole genre).
  const strong = Object.values(genreObs).filter(o => o.n >= CONFIRM_MIN_N && Math.abs(axisMean(o)) >= MIN_OPINION);
  if (strong.length === 0) return 0.05;
  // Coverage of the WHOLE map: the model must have CONFIRMED likes AND dislikes —
  // knowing only what someone loves is half a taste. A likes-only profile is capped
  // at ~0.55 coverage until at least a couple of dislikes are also confirmed (n≥2),
  // which is what forces the quiz to re-test and pin the dislikes too.
  const likes = strong.filter(o => axisMean(o) > 0).length;
  const dislikes = strong.filter(o => axisMean(o) < 0).length;
  const coverage = 0.55 * Math.min(1, likes / 3) + 0.45 * Math.min(1, dislikes / 2);
  // Quality weighted by opinion STRENGTH — the axes the user feels most strongly
  // about dominate; a barely-over-threshold noisy axis can't drag the meter around.
  const wq = strong.reduce((s, o) => s + axisPinned(o) * Math.abs(axisMean(o)), 0);
  const wsum = strong.reduce((s, o) => s + Math.abs(axisMean(o)), 0);
  const meanQuality = wsum > 0 ? wq / wsum : 0;
  // Sub-genre resolution: a profile whose sub-genres are pinned (we know it's
  // "slasher", not vaguely "horror") is better understood than a broad-genre-only
  // read. Soft multiplier — no pinned niche still allows ~0.78, two pinned reach
  // full — so the genre layer alone can converge, niches just sharpen it.
  const pinnedNiches = Object.values(nicheObs).filter(o => o.n >= CONFIRM_MIN_N && Math.abs(axisMean(o)) >= 1.2).length;
  const resolution = 0.78 + 0.22 * Math.min(1, pinnedNiches / PINNED_NICHE_REF);
  return Math.max(0.05, Math.min(0.99, coverage * meanQuality * resolution));
}

async function getTrailerForMovieId(tmdbId: string): Promise<string> {
  if (!TMDB_API_KEY || tmdbId.startsWith('fb')) return '';
  try {
    // No language filter — `language=en-US` silently dropped anime/foreign titles that
    // have no en-US video, leaving the card without a trailer. Degrade Trailer→Teaser→any.
    const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${TMDB_API_KEY}`, { next: { revalidate: 3600 } });
    if (!res.ok) return '';
    const data = await res.json();
    const yt = (data.results || []).filter((v: any) => v.site === 'YouTube');
    if (!yt.length) return '';
    const pick = (type: string) =>
      yt.find((v: any) => v.type === type && (v.iso_639_1 === 'en' || !v.iso_639_1)) ||
      yt.find((v: any) => v.type === type);
    const chosen = pick('Trailer') || pick('Teaser') || yt[0];
    return chosen ? chosen.key : '';
  } catch(e) {
    return '';
  }
}

async function fetchMoviesFromTMDB(page: number, affinities: Record<string, number>, locale: string = 'he', disableRandomYear: boolean = false, stats: GenreStats = {}, obs: ObsStore = {}): Promise<MovieContext[]> {
  const POOL = fullBaselinePool(locale);
  if (!TMDB_API_KEY) return POOL;

  // 1. Analyze Affinities to dynamically build API query
  let likedGenres: string[] = [];
  let hatedSet = new Set<string>();

  Object.entries(affinities).forEach(([genreId, score]) => {
    if (genreId !== 'General' && !genreId.startsWith('k:')) {
      if (score >= 2) likedGenres.push(genreId);
    }
  });
  // Exclude only CONFIRMED dislikes (TASTE-FORMULA.md §10): a genre the user rated
  // negative at least TWICE with an agreeing mean. A single 1★ is NOT enough to
  // prune the genre from the stream — the engine deliberately serves it ONE more
  // time to confirm (the owner's "loving Scream ≠ loving horror" principle, applied
  // to dislikes: be sure before you decide). Once confirmed, it's gone for good.
  Object.entries(obs).forEach(([g, o]) => {
    if (o.n >= CONFIRM_MIN_N && (o.sum / o.n) <= -MIN_OPINION) hatedSet.add(g);
  });
  // Exposure-adjusted exclusion (TASTE-FORMULA.md §8): a genre the user keeps
  // SKIPPING is also worth pruning from the live stream — but CONTINUOUSLY, never
  // a hard count cliff. We exclude a genre once its Beta-Binomial seen-weight
  // drops below 0.3 AND it has real exposure (n≥3), i.e. a sustained skip-rate,
  // not one unlucky miss. This fuses behavior (skips) where the old code had only
  // explicit hate (affinity≤−5) — a user who silently skips every horror title
  // never has to 1★ one for us to stop serving them.
  Object.entries(stats).forEach(([g, e]) => {
    if (e.n >= 3 && betaWeight(stats, g) < 0.3) hatedSet.add(g);
  });
  // API-level exclusion is a blunt instrument: a horror lover who hates Comedy
  // would lose every horror-comedy and horror-mystery too (secondary tags).
  // Exclude only the 3 STRONGEST signals (most-hated, then most-skipped); the
  // scoring gate + EIG·P(seen) picker handle the rest softly.
  let hatedGenres = Array.from(hatedSet)
    .sort((a, b) => ((affinities[a] || 0) - betaWeight(stats, a)) - ((affinities[b] || 0) - betaWeight(stats, b)))
    .slice(0, 3)
    .filter(g => !likedGenres.includes(g));

  const langParam = locale === 'en' ? 'en-US' : 'he-IL';
  
  // 🔥 SCALE: Unlock 100,000+ movies!
  // TMDB caps at 500 pages. By picking a random year between 1980 and 2024, 
  // we access 500 pages of THAT specific year, exponentially growing our movie pool.
  let url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${langParam}&sort_by=popularity.desc&vote_count.gte=300&page=${page}`;
  
  if (!disableRandomYear) {
    const randomYear = Math.floor(Math.random() * (2024 - 1980 + 1)) + 1980;
    url += `&primary_release_year=${randomYear}`;
  }
  
  if (likedGenres.length > 0) {
    url += `&with_genres=${likedGenres.slice(0,2).join(',')}`;
  }
  if (hatedGenres.length > 0) {
    url += `&without_genres=${hatedGenres.join(',')}`;
  }

  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return POOL;
    let data = await res.json();

    // A year+genre+vote_count-filtered discover query often has far fewer pages
    // than requested — TMDB returns an empty result set past total_pages, which
    // silently starved the live phase back to the 12-movie fallback pool.
    if ((!data.results || data.results.length === 0) && page > 1) {
      const retry = await fetch(url.replace(`page=${page}`, 'page=1'), { next: { revalidate: 0 } });
      if (retry.ok) data = await retry.json();
    }
    if (!data.results || data.results.length === 0) return POOL;

    return data.results.filter((m: any) => m.poster_path && m.overview).map((m: any) => {
      const mainGenreId = m.genre_ids && m.genre_ids.length > 0 ? m.genre_ids[0] : 28;
      const eggType = GENRE_MAP[mainGenreId]?.egg || 'oscar';
      return {
        id: m.id.toString(), title: m.title, originalDetails: `${m.original_title} · ${m.release_date ? m.release_date.split('-')[0] : ''}`,
        rating: m.vote_average, posterUrl: `/api/poster?path=${m.poster_path}`, overview: m.overview,
        trailerId: '', easterEgg: { type: eggType }, _genreIds: m.genre_ids
      };
    });
  } catch (e) { return POOL; }
}

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const payload: AnswerPayload = await req.json();

    // Rate-limit per ip+session, not per ip: a 40-question quiz plus retries
    // legitimately needs ~60 requests, and shared IPs (households, offices,
    // campus NAT) would silently 429 each other's votes — eroding taste
    // signal with no visible error. 120/min per session is generous for one
    // human and still a hard wall for abuse.
    const rateKey = `${ip}:${payload.sessionId || 'anon'}`;
    if (!checkRateLimit(rateKey, 120, 60000)) {
      return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
    }
    const currentCount = parseInt(req.headers.get('x-history-count') || '0', 10);
    const locale = req.headers.get('x-locale') || 'he';
    let askedMovieIds: string[] = JSON.parse(req.headers.get('x-asked-ids') || '[]');
    let userAffinities: Record<string, number> = JSON.parse(req.headers.get('x-affinities') || '{}');
    // Cross-quiz variety (TASTE-FORMULA.md §11): a rolling list of movies served in
    // RECENT quizzes (client localStorage). Excluded from selection only — never
    // returned — so consecutive quizzes feel like fresh experiences, not reruns.
    let recentIds: string[] = JSON.parse(req.headers.get('x-recent-ids') || '[]');
    const freshIds = (extra: string[] = []) => Array.from(new Set([...askedMovieIds, ...recentIds, ...extra]));
    // RATED clock — only real 1–5★ answers advance completion. A NOT_SEEN is an
    // omitted item (MCAR): zero taste signal, must NEVER raise count/confidence.
    // Back-compat: fall back to total history when the rated header is absent.
    let ratedCount = parseInt(req.headers.get('x-rated-count') ?? String(currentCount), 10);
    // Fisher information of the taste estimate (SE = 1/√(1+infoSum)) — adaptive
    // stopping driver (TASTE-FORMULA.md §9). Seeded from legacy confidence if absent.
    let infoSum = parseFloat(req.headers.get('x-info') ?? '0');
    // v12 observation stores — raw signed votes per genre / niche, the basis for the
    // consistency-based confidence (TASTE-FORMULA.md §10).
    let genreObs: ObsStore = JSON.parse(req.headers.get('x-genre-obs') || '{}');
    let nicheObs: ObsStore = JSON.parse(req.headers.get('x-niche-obs') || '{}');
    // Per-genre exposure tally for the Beta-Binomial serving weight (§8).
    let genreStats: Record<string, { n: number; s: number }> =
      JSON.parse(req.headers.get('x-genre-stats') || '{}');
    const noteServed = (ids?: number[]) => (ids || []).forEach(g => {
      const k = g.toString(); const e = genreStats[k] || { n: 0, s: 0 }; e.n++; genreStats[k] = e;
    });
    const noteSkipped = (ids?: number[]) => (ids || []).forEach(g => {
      const k = g.toString(); const e = genreStats[k] || { n: 0, s: 0 }; e.s++; genreStats[k] = e;
    });

    if (payload.isInit) {
      // Start with iconic baseline movies to hook the user and establish initial strong signals.
      // Deterministic coverage order — see BASELINE_ORDER rationale.
      const sessionId = payload.sessionId || `session_${Date.now()}`;
      let selected = pickBaselineMovie(sessionId, freshIds(), locale, userAffinities);
      if (!selected) {
        const pool = fullBaselinePool(locale).filter(m => !askedMovieIds.includes(m.id));
        selected = pool.length > 0 ? pool[0] : fullBaselinePool(locale)[0];
      }
      if (!selected.trailerId) selected.trailerId = await getTrailerForMovieId(selected.id);
      selected._niches = await getNichesForMovie(selected.id);
      warmPoster(selected.posterUrl);
      noteServed(selected._genreIds); // exposure tally starts at the first served movie
      // Do NOT pre-push the served movie into askedMovieIds: the answer handler
      // guards affinity updates with `!askedMovieIds.includes(movieId)` to block
      // double-counting, so a pre-pushed id made the user's FIRST vote — usually
      // their most enthusiastic — silently vanish from their taste profile.
      // The id is recorded when the answer arrives, which also keeps dedup intact.

      return NextResponse.json({
        sessionId: payload.sessionId || `session_${Date.now()}`,
        isComplete: false, confidenceScore: 0.01, historyCount: 0,
        ratedCount: 0, infoSum: 0, genreStats, genreObs, nicheObs,
        askedMovieIds, userAffinities: {},
        currentVectorState: { possibleMoviesRemaining: 85432, leadingMicroGenres: [locale === 'en' ? 'Initializing global scan...' : 'מאתחל סריקה גלובלית...'] },
        currentQuestion: { id: `init_${Date.now()}`, text: await generateDynamicQuestion(selected.title, selected.overview, locale), movie: selected }
      }, { status: 200 });
    }

    // 👑 אלגוריתם התקדמות כירורגי ודינמי לחלוטין
    // A real 1–5★ rating is a measured item; a NOT_SEEN is an omitted item (MCAR)
    // — it advances neither the rated clock nor confidence, only the exposure tally.
    const isSkip = typeof payload.answer !== 'number';

    if (payload.movieId && !askedMovieIds.includes(payload.movieId)) {
      askedMovieIds.push(payload.movieId);
      if (isSkip) {
        // Omitted item: zero taste signal. Record only that these genres were
        // shown-and-skipped, feeding the Beta-Binomial serving weight (§8).
        noteSkipped(payload.genreIds);
      } else if (typeof payload.answer === 'number') {
        const base = (payload.answer - 3); // -2..+2
        ratedCount++; // ← the completion clock only ticks on real ratings

        // v12 raw observations (TASTE-FORMULA.md §10) — the basis for consistency.
        // Log the FULL signed vote (−2..+2) for EVERY genre/niche the movie carried,
        // with NO primary/secondary half-weighting. Position-weighting belongs in
        // userAffinities (serving); here it only manufactures false variance — the
        // same genre seen once as primary (+2) and once as secondary (+1) would look
        // "inconsistent" even though the user clearly loves it. With full-base
        // recording, a genre that is CONSISTENTLY present in liked movies pins
        // (low variance), while an incidental co-genre gets mixed votes across movies
        // (high variance) and correctly stays unpinned — the model self-discovers
        // which axis truly drives the taste.
        // Record the FULL signed vote (−2..+2) for EVERY genre the movie carries —
        // NO position half-weighting (that manufactured false variance: the same
        // genre as primary +2 vs secondary +1 looked "inconsistent"). Every genre is
        // measured (coverage), and a genre only the user truly cares about stays
        // low-variance and pins; an incidental co-genre gets contradictory votes
        // across movies (e.g. Drama: +2 in an action-drama, 0 in a pure drama, −2 in
        // a romance-drama) → high variance → correctly never pins. Niches recorded full.
        (payload.genreIds || []).forEach(g => recordObs(genreObs, g.toString(), base));
        (payload.niches || []).slice(0, 4).forEach(nk => recordObs(nicheObs, nicheKey(nk), base));

        // Fisher information of this item: 0 for a fence-sitting 3★, 1 for a 2/4★,
        // 4 for a decisive 1/5★ — scaled by the primary genre's IDF (a rare genre
        // pins taste harder) plus a niche bonus (esoteric votes are high-signal).
        const idfPrimary = (payload.genreIds && payload.genreIds.length > 0)
          ? (GENRE_IDF[payload.genreIds[0].toString()] ?? 1) : 1;
        let infoGain = base * base * idfPrimary;
        if (payload.niches && payload.niches.length > 0) infoGain += 0.5 * base * base;
        infoSum += infoGain;

        if (base !== 0) {
          userAffinities['General'] = (userAffinities['General'] || 0) + base;

          // Asymmetric amplification:
          //  - Love (×2) must clear the archetype detection threshold from a single
          //    strong vote — one 5★ is a real signal, not noise.
          //  - Hate (×3) is punished harder: a rejected genre should crater so it
          //    never resurfaces in recommendations (negative affinity).
          //  - Primary genre gets full weight, secondary genres half — a 5★ on
          //    The Dark Knight says "Action" much louder than "Thriller".
          if (payload.genreIds && payload.genreIds.length > 0) {
            const polarity = base > 0 ? 2 : 3;
            payload.genreIds.forEach((g, idx) => {
              const idf = GENRE_IDF[g.toString()] ?? 1;
              // A 1★ is the user shouting "NOT this." Hate must reject the whole
              // movie's STYLE — primary at full weight, secondaries at 0.4. The old
              // "primary-only" rule (secondary weight 0) let a disliked style survive
              // whenever it rode as a SECONDARY tag: animated films are often tagged
              // [Comedy, Animation] or [Adventure, Animation], so 1-starring them
              // cratered Comedy/Adventure but left Animation untouched — and the user
              // kept getting animations. Secondaries are weaker than the primary but
              // are NOT zero: hating a comedy-drama still nudges drama down a little,
              // which a true drama lover's accumulated +love easily absorbs.
              const positionWeight = idx === 0 ? 1 : (base > 0 ? 0.5 : 0.4);
              const w = base * polarity * positionWeight * idf;
              userAffinities[g.toString()] = (userAffinities[g.toString()] || 0) + w;
            });
            inferLatentAffinities(userAffinities);
          }

          // Sub-genre layer (TASTE-FORMULA.md §2): each tagged niche moves at
          // 0.75 — rarer, self-selected signals; capped upstream at 4/movie.
          if (payload.niches && payload.niches.length > 0) {
            payload.niches.slice(0, 4).forEach(n => {
              const polarity = base > 0 ? 2 : 3;
              const w = base * polarity * 0.75;
              const key = nicheKey(n);
              userAffinities[key] = (userAffinities[key] || 0) + w;
            });
          }
        }
      }
    }

    // Adaptive stopping by STANDARD ERROR (TASTE-FORMULA.md §9, CAT/IRT). The taste
    // estimate's SE shrinks as informative ratings accumulate: SE = 1/√(1+infoSum).
    // We stop when the measurement is precise enough — decisive raters earn a fast
    // exit (~18 Qs), fence-sitters keep going to the hard cap. `answeredCount` is
    // the RATED clock: NOT_SEEN never moves it, so a heavy skipper is never rushed
    // to a premature, low-confidence read.
    const answeredCount = ratedCount;
    // v12 confidence (TASTE-FORMULA.md §10): the meter reflects whether the model
    // genuinely KNOWS the user — coverage of the taste map (likes AND dislikes),
    // per-axis consistency (repeat votes that agree), decisiveness, and sub-genre
    // resolution. It is NOT a count: 3 decisive clicks on one genre score low
    // because coverage is thin and nothing is re-confirmed. A contradiction (5★
    // then 1★ on the same axis) raises that axis's variance and pulls the meter
    // back down, asking for another measurement.
    let newConfidence = computeConfidence(genreObs, nicheObs);
    // Fully adaptive length: there is NO fixed question count. Stop only when the
    // model is genuinely confident. A small floor (enough screens for real coverage)
    // guards against an early lucky-looking read; a high safety cap prevents an
    // endless quiz for a self-contradicting user.
    const MIN_SCREENS = 12;       // never "done" before the baseline's full coverage
    const TARGET_CONFIDENCE = 0.9;
    const SAFETY_CAP = 60;
    let isComplete = false;
    if (answeredCount >= MIN_SCREENS && newConfidence >= TARGET_CONFIDENCE) isComplete = true;
    else if (answeredCount >= SAFETY_CAP) isComplete = true;

    let nextMovie = null;
    let finalMoviesResult = undefined;

    if (!isComplete) {
      if (ratedCount < 11) {
        // Exploration phase: 12 RATED baseline movies — every genre bucket measured
        // at least once (see BASELINE_ORDER). Keyed on the RATED clock, not total
        // screens, so a skipper still earns the full baseline before live drilling.
        let selected = pickBaselineMovie(payload.sessionId || '', freshIds(), locale, userAffinities);
        if (!selected) {
          const remaining = fullBaselinePool(locale).filter(m => !askedMovieIds.includes(m.id));
          selected = remaining.length > 0 ? remaining[0] : fullBaselinePool(locale)[0];
        }
        if (!selected.trailerId) selected.trailerId = await getTrailerForMovieId(selected.id);
        selected._niches = await getNichesForMovie(selected.id);
      warmPoster(selected.posterUrl);
        noteServed(selected._genreIds);
        nextMovie = { id: `q_${Date.now()}`, text: await generateDynamicQuestion(selected.title, selected.overview, locale), movie: selected };
      } else {
        // As confidence grows, we fetch from earlier pages (most popular) that match
        // the affinities. Capped at 10 — filtered discover queries rarely have more
        // pages, and requesting past total_pages returns an empty set.
        const maxPage = Math.min(10, Math.max(1, Math.floor(500 * (1 - newConfidence))));
        const randomPage = Math.floor(Math.random() * maxPage) + 1;
        // Same-title repeats (remakes, re-releases, sequels sharing a name) read
        // as duplicates to the user even when the TMDB ids differ — block both.
        const askedTitleSet = new Set((payload.askedTitles || []).map(t => t.trim().toLowerCase()));
        const recentSet = new Set(recentIds);
        const notSeenBefore = (m: MovieContext) =>
          !askedMovieIds.includes(m.id) && !recentSet.has(m.id) && !askedTitleSet.has(m.title.trim().toLowerCase());

        // BROAD pool during the quiz (no with_genres narrowing): the obs-driven
        // picker needs unconfirmed axes available — disliked genres to CONFIRM and
        // un-measured genres to COVER, not just the user's already-liked ones. We
        // still pass genreObs so CONFIRMED dislikes are pruned. Narrowing to liked
        // genres is for the FINAL recommendations only. (Bonus: a broad stream makes
        // every quiz feel different instead of hammering the same liked genre.)
        let availableMovies = await fetchMoviesFromTMDB(randomPage, {}, locale, false, genreStats, genreObs);
        let filtered = availableMovies.filter(notSeenBefore);

        if (filtered.length === 0) {
          // Fallback to random page without strict filters if too narrow
          availableMovies = await fetchMoviesFromTMDB(Math.floor(Math.random() * 50) + 1, {}, locale, false, genreStats, genreObs);
          filtered = availableMovies.filter(notSeenBefore);
        }

        if (filtered.length === 0) filtered = fullBaselinePool(locale).filter(m => !askedMovieIds.includes(m.id));
        if (filtered.length === 0) {
          isComplete = true;
        }

        if (!isComplete) {
          // Drill by effective_EIG = EIG · P(seen) (TASTE-FORMULA.md §9): spend the
          // question where taste is most uncertain AND the user is most likely to
          // have actually seen the title — adaptive item selection, not blind random.
          const selected = pickLiveCandidate(filtered, genreObs, nicheObs, genreStats);
          if (!selected.trailerId) selected.trailerId = await getTrailerForMovieId(selected.id);
          selected._niches = await getNichesForMovie(selected.id);
      warmPoster(selected.posterUrl);
          noteServed(selected._genreIds);
          nextMovie = { id: `q_${Date.now()}`, text: await generateDynamicQuestion(selected.title, selected.overview, locale), movie: selected };
        }
      }
    } 
    
    if (isComplete) {
      // 👑 Fetch the absolute best matches based on highly liked genres (without year constraints)
      let bestMovies = await fetchMoviesFromTMDB(1, userAffinities, locale, true, genreStats, genreObs);
      let availableResults = bestMovies.filter(m => !askedMovieIds.includes(m.id));
      if (availableResults.length === 0) availableResults = fullBaselinePool(locale).filter(m => !askedMovieIds.includes(m.id)).slice(0, 8); 
      
      // TASTE-FORMULA.md §4: rank candidates by the FULL taste vector, not
      // popularity. Enrich the top candidates with their niches, score, and
      // pick top-2 + one serendipity gem (best-scoring from outside the top 5
      // popularity ranks — a movie they didn't know they wanted).
      let pool = availableResults.slice(0, 14);

      // Niche-direct injection (TASTE-FORMULA.md §7): when the user has strong
      // niche axes, pull candidates that CARRY those niches by construction —
      // an esoteric taste deserves esoteric movies, not generic genre-mates.
      const strongNiches = Object.entries(userAffinities)
        .filter(([k, v]) => isNicheKey(k) && v >= 4)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k]) => k.slice(2));
      if (strongNiches.length > 0) {
        const ids = (await Promise.all(strongNiches.map(keywordIdForNiche))).filter((x): x is number => x !== null);
        if (ids.length > 0) {
          try {
            const langParam = locale === 'en' ? 'en-US' : 'he-IL';
            const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${langParam}&sort_by=popularity.desc&vote_count.gte=100&with_keywords=${ids.join('|')}&page=1`, { next: { revalidate: 0 } });
            if (res.ok) {
              const data = await res.json();
              const nicheTrue = (data.results || [])
                .filter((m: any) => m.poster_path && m.overview && !askedMovieIds.includes(m.id.toString()) && !pool.some(p => p.id === m.id.toString()))
                .slice(0, 10)
                .map((m: any) => ({
                  id: m.id.toString(), title: m.title,
                  originalDetails: `${m.original_title} · ${m.release_date ? m.release_date.split('-')[0] : ''}`,
                  rating: m.vote_average, posterUrl: `/api/poster?path=${m.poster_path}`, overview: m.overview,
                  trailerId: '', easterEgg: { type: 'oscar' as const }, _genreIds: m.genre_ids
                }));
              pool = nicheTrue.concat(pool);
            }
          } catch { /* pool stays as-is */ }
        }
      }

      for (const m of pool) m._niches = await getNichesForMovie(m.id);
      let scored = pool
        .map(m => ({ m, s: scoreMovieForUser(m, userAffinities) }))
        .filter(x => Number.isFinite(x.s))
        .sort((a, b) => b.s - a.s);

      // Extreme haters can gate almost everything out. Never deliver fewer
      // than 3 recommendations — widen to an unfiltered popular pool and keep
      // the best non-gated survivors.
      if (scored.length < 3) {
        const wide = (await fetchMoviesFromTMDB(1, {}, locale, true, genreStats, genreObs))
          .filter(m => !askedMovieIds.includes(m.id) && !pool.some(p => p.id === m.id))
          .slice(0, 14);
        for (const m of wide) m._niches = await getNichesForMovie(m.id);
        pool = pool.concat(wide);
        scored = scored.concat(
          wide.map(m => ({ m, s: scoreMovieForUser(m, userAffinities) }))
            .filter(x => Number.isFinite(x.s))
        ).sort((a, b) => b.s - a.s);
      }
      const gem = scored.find(x => pool.indexOf(x.m) >= 5 && x !== scored[0] && x !== scored[1]);
      let picks = [scored[0], scored[1], gem || scored[2]].filter(Boolean);

      // All-hater fallback: someone who 1-stars everything gates out all of
      // cinema. Serve the LEAST-BAD three (gate-free scoring) — an honest
      // answer beats an empty screen.
      if (picks.length === 0 && pool.length > 0) {
        picks = pool
          .map(m => ({ m, s: scoreMovieForUser(m, userAffinities, true) }))
          .sort((a, b) => b.s - a.s)
          .slice(0, 3);
      }
      const sMax = picks[0]?.s ?? 1, sMin = scored[scored.length - 1]?.s ?? 0;
      const span = Math.max(1e-6, sMax - sMin);
      for (const p of picks) {
        if (!p.m.trailerId) p.m.trailerId = await getTrailerForMovieId(p.m.id);
        warmPoster(p.m.posterUrl);
      }
      finalMoviesResult = picks.map(p => ({
        id: `res_${p.m.id}`, title: p.m.title,
        // Real per-movie match: normalized score mapped to 84-99 — honest
        // variance instead of a constant fake 99.
        matchScore: Math.round(84 + 15 * Math.max(0, Math.min(1, (p.s - sMin) / span))),
        posterUrl: p.m.posterUrl, trailerId: p.m.trailerId, overview: p.m.overview,
        _genreIds: p.m._genreIds, // exposed so QA can assert recs never include a hated genre
      }));
    }

    // 👑 Sales Psychology: Dramatic reduction in remaining movies to build massive FOMO
    const remainingMovies = isComplete ? 1 : Math.max(2, Math.floor(85432 * Math.pow(1 - newConfidence, 4.5)));
    
    let psychologicalMessage = locale === 'en' ? 'Catching your vibe...' : 'קולט את הווייב שלך...';
    if (isComplete) {
      const axes = topTasteAxes(userAffinities, locale);
      if (axes.length > 0) {
        psychologicalMessage = locale === 'en'
          ? `Your taste decoded: ${axes.join(' · ')}. Matches locked in.`
          : `הטעם שלך פוענח: ${axes.join(' · ')}. ההתאמות ננעלו.`;
      }
    }
    if (newConfidence > 0.8) psychologicalMessage = locale === 'en' ? 'Wow, you have a very specific taste. Only a few movies match...' : 'אוקיי, יש לך טעם ממש מיוחד. נשארו סרטים בודדים שיכולים להתאים...';
    else if (newConfidence > 0.5) psychologicalMessage = locale === 'en' ? 'Filtering out thousands of irrelevant movies...' : 'מעיף עכשיו אלפי סרטים שלא בכיוון שלך בכלל...';
    else if (newConfidence > 0.3) psychologicalMessage = locale === 'en' ? 'Starting to understand you...' : 'מתחיל להבין אותך...';

    // Generate proof token if complete
    let proofToken = null;
    if (isComplete) {
      const { signSessionState } = await import('@/lib/sessionToken');
      proofToken = signSessionState({
        sessionId: payload.sessionId || `session_${Date.now()}`,
        totalAnswers: ratedCount, // real ratings only — NOT_SEEN is not an answer
        affinities: userAffinities,
        completedAt: Date.now()
      });
    }

    // Display progress = honest fraction of the confidence target (TASTE-FORMULA
    // §10). It tracks how well the model knows the user, NOT how many questions were
    // asked — so it will sit low after 3 decisive-but-narrow answers and only
    // approach 100 as coverage + consistency + resolution actually build.
    const progressPercent = isComplete
      ? 100
      : Math.min(99, Math.round(100 * (newConfidence / TARGET_CONFIDENCE)));

    return NextResponse.json({
      sessionId: payload.sessionId || `session_${Date.now()}`,
      isComplete, confidenceScore: isComplete ? 1.0 : newConfidence,
      progressPercent,
      // historyCount carries the RATED clock now (NOT_SEEN never advances it).
      historyCount: ratedCount, ratedCount, infoSum, genreStats, genreObs, nicheObs,
      askedMovieIds, userAffinities,
      currentVectorState: { possibleMoviesRemaining: remainingMovies, leadingMicroGenres: isComplete ? [psychologicalMessage, ...topTasteAxes(userAffinities, locale)] : [psychologicalMessage] },
      currentQuestion: isComplete ? null : nextMovie,
      finalMovies: finalMoviesResult,
      proofToken
    }, { status: 200 });

  } catch (error) {
    await sendTelegramAlert('🚨 <b>CineMind Error</b>\nCritical failure in next-question API.\n' + String(error));
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}