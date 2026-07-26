import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { tasteModel } from './model';

// Every LLM call is bounded. Without this a loading/wedged Ollama (model being pulled, GPU
// stuck) left the request hanging forever, so the user's quiz never answered. On timeout the
// caller falls back to its deterministic path, which always produces a correct result.
const LLM_TIMEOUT_MS = 25_000;

// ── The taste brain (Akinator-style LLM reasoner) ────────────────────────────
// Given the user's rating history and a pool of REAL TMDB candidate movies, the
// model either picks the single most-revealing next movie to ask about, or — once
// it genuinely understands the taste at SUB-GENRE resolution — returns ranked
// recommendations. It never invents data: questions are chosen from the supplied
// pool, and recommendations are grounded against TMDB by the caller.

export interface BrainHistoryItem {
  id?: string;      // TMDB id of the rated movie (for excluding disliked films from recs)
  title: string;
  year?: string;
  genres: string[]; // human-readable genre names
  rating: number;   // 1..5
}
export interface BrainCandidate {
  id: string;
  title: string;
  year?: string;
  genres: string[];
}

const BrainResult = z.object({
  phase: z.enum(['ask', 'done']).describe('"ask" to pose another question, "done" when the taste is understood'),
  confidence: z.number().min(0).max(1).describe('How certain you are that you truly know this user — likes AND dislikes at sub-genre resolution. Be honest; contradictory or thin evidence means LOW confidence.'),
  tasteSummary: z.string().describe('One or two sentences describing the taste you have inferred so far, at sub-genre resolution (e.g. "loves self-aware/meta horror-comedy, dislikes earnest supernatural; prefers 90s practical-effects over modern CGI").'),
  nextPickId: z.union([z.string(), z.number(), z.null()]).optional().describe('When phase="ask": the id (from the provided candidate pool) of the movie that will MOST narrow/resolve the taste. Null/omit when phase="done".'),
  nextReason: z.union([z.string(), z.null()]).optional().describe('When phase="ask": short reason this movie best separates your live hypotheses.'),
  searchHint: z.union([z.string(), z.null()]).optional().describe('CRITICAL for sub-genre resolution: a short search phrase naming the SPECIFIC sub-genre/style you want to probe NEXT, so the next batch of candidate movies targets your live hypothesis (e.g. "slasher horror", "supernatural horror", "heist thriller", "cerebral hard sci-fi", "space opera", "rom-com", "wuxia martial arts"). Change it as your hypothesis shifts. Without this, narrow niche tastes are invisible in a generic popular pool.'),
  recommendations: z.array(z.object({
    title: z.string(),
    year: z.union([z.string(), z.number(), z.null()]).optional(),
    reason: z.string().describe('Why this fits the demonstrated taste, referencing specific sub-genre evidence.'),
  })).default([]).describe('When phase="done": exactly 3 movies the user likely has NOT seen but will love. Empty array when phase="ask".'),
});

// Small local models are inconsistent about types (year as number, omitted nulls).
// The schema accepts those; helpers normalize downstream so good REASONING isn't
// rejected over output formatting.
export type BrainResult = z.infer<typeof BrainResult>;
export const asStr = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

const SYSTEM = `You are CineMind, a world-class film-taste expert running an Akinator-style quiz.
Your job: from a user's 1-5 star ratings, deduce their taste and recommend movies they'll love.

CORE PRINCIPLES (follow exactly):
1. SUB-GENRE RESOLUTION — this is the whole game. Loving ONE film of a genre does NOT
   mean loving the genre; find the SPECIFIC pattern. Examples of axes to resolve (do NOT
   default to any one of these — infer from the actual ratings): horror (slasher vs
   supernatural vs psychological vs body-horror vs comedy-horror), comedy (satire vs
   slapstick vs cringe vs rom-com vs dark), sci-fi (cyberpunk vs space-opera vs hard-SF
   vs dystopia), action (martial-arts vs heist vs war vs superhero), romance (sweeping
   epic vs indie/bittersweet vs comedic), drama (character study vs sprawling epic vs
   social realism). Also weigh mood, era, pacing, tone, and director/franchise
   affinities. Build the read from THIS user's evidence — never force a favorite theory.
2. RATINGS ARE LITERAL — 5 = loves it, 1 = actively dislikes that style, 3 = neutral.
   A low rating must steer you AWAY from that style; a high rating toward it.
3. DRILL THE LOVE, DROP THE HATE — this is how you win.
   • The moment a movie scores 4-5, that is a HOT LEAD. Identify its MOST SPECIFIC
     sub-genre and set "searchHint" to exactly that, then serve SEVERAL more of that
     precise sub-genre to confirm it's the pattern (not a fluke). Do not wander to
     adjacent labels.
   • Be precise about near-neighbours — they are different tastes, never merge them:
     slasher (masked/human killer, body count) ≠ supernatural horror (ghosts, demons,
     possession) ≠ psychological horror (madness, unreliable mind) ≠ body horror.
     Likewise space-opera ≠ hard-SF ≠ cyberpunk; rom-com ≠ tragic romance; satire ≠
     slapstick. If they LOVE one and you have evidence, name THAT one — not the umbrella.
   • Once a sub-genre scores 1-2, it is CONFIRMED disliked: stop serving it and never
     recommend it. Don't keep probing a region you've ruled out.
   • Early on (no clear love yet) hint different sub-genres each turn to find the
     region; the opening questions already sample many sub-genres for you.
4. HONEST CONFIDENCE — be confident ONLY when you understand both LIKES and DISLIKES at
   sub-genre resolution. Thin evidence (few ratings) or contradictions (loved and hated
   similar films) = LOW confidence. Do not claim to know the user after a few clicks.
5. GROUNDING — when asking, you MUST pick nextPickId from the provided candidate pool
   (these are real movies). When recommending, propose real, well-known films with their
   year; they will be validated against a movie database.

OUTPUT: strictly the requested JSON. When phase="ask", set nextPickId + nextReason and
leave recommendations empty. When phase="done", set 3 recommendations and leave nextPickId null.`;

function fmtHistory(h: BrainHistoryItem[]): string {
  if (!h.length) return '(no ratings yet — this is the first question)';
  return h.map(x => `- ${x.title}${x.year ? ` (${x.year})` : ''} [${x.genres.join('/')}] → ${x.rating}/5`).join('\n');
}
function fmtPool(p: BrainCandidate[]): string {
  return p.map(c => `${c.id}: ${c.title}${c.year ? ` (${c.year})` : ''} [${c.genres.join('/')}]`).join('\n');
}

/**
 * One brain step. `minQuestions`/`maxQuestions` are soft guards passed into the prompt
 * so the model paces itself (it still decides phase). Returns the validated result, or
 * null if no model backend is configured (caller should fall back to the formula engine).
 */
export async function brainStep(opts: {
  history: BrainHistoryItem[];
  pool: BrainCandidate[];
  minQuestions?: number;
  maxQuestions?: number;
  mock?: boolean;
  forceDone?: boolean;
}): Promise<BrainResult | null> {
  const { history, pool, minQuestions = 6, maxQuestions = 30, forceDone = false } = opts;

  // Deterministic mock (BRAIN_MOCK=1 or opts.mock) — exercises the full pipeline (TMDB grounding,
  // history, response shape, rec resolution) WITHOUT an LLM backend, for offline
  // validation. Heuristic: keep asking about movies whose genres are least-measured;
  // finish once enough liked/disliked genres are seen, then recommend from the
  // strongest-liked genres. Swapped out the moment a real model is configured.
  if (opts.mock || process.env.BRAIN_MOCK === '1') return mockBrainStep(history, pool, minQuestions, maxQuestions);

  const model = tasteModel();
  if (!model) return null;

  const prompt = `RATINGS SO FAR (${history.length}):
${fmtHistory(history)}

CANDIDATE POOL for the next question (pick nextPickId from these real movies):
${fmtPool(pool)}

Pacing guidance: you have asked ${history.length} questions. Don't finish before ~${minQuestions} unless the taste is already crystal-clear and consistent; you may keep going up to ~${maxQuestions} if the taste is still ambiguous or contradictory. Decide phase honestly based on whether you truly understand this person's taste at sub-genre resolution.${forceDone ? `

HARD STOP: you have reached the question limit. You MUST set phase="done" now and output exactly 3 recommendations based on everything you have learned. Do not ask another question.` : ''}`;

  // Structured call with one retry — local models occasionally return a
  // type-mismatched or truncated object; a single retry recovers most of those.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { object } = await generateObject({
        model,
        schema: BrainResult,
        system: SYSTEM,
        prompt,
        temperature: 0.4,
        abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      });
      return object;
    } catch {
      if (attempt === 0) continue; // retry once before the text fallback
    }
    // Fallback: free-form generation + JSON extraction + schema validation, so a
    // capable-but-quirky local model still drives the quiz.
    try {
      const { text } = await generateText({
        model,
        system: SYSTEM + '\n\nRespond with ONLY a single JSON object, no markdown, no prose. Schema keys: phase("ask"|"done"), confidence(0-1), tasteSummary(string), nextPickId(string|null), nextReason(string|null), recommendations(array of {title, year, reason}).',
        prompt,
        temperature: 0.4,
        abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      });
      const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, ''); // strip reasoning models
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (!m) return null;
      return BrainResult.parse(JSON.parse(m[0]));
    } catch {
      return null; // caller falls back to the formula engine
    }
  }
  return null;
}

// Dedicated FINAL recommendation call — a clean, single-purpose prompt (no pool, no
// "ask vs done" framing) so the model commits to 3 picks instead of trying to ask
// another question. This is what reliably produces real recommendations.
const RecResult = z.object({
  tasteSummary: z.string(),
  recommendations: z.array(z.object({
    title: z.string(),
    year: z.union([z.string(), z.number(), z.null()]).optional(),
    reason: z.string(),
  })).default([]),
});
export async function brainRecommend(
  history: BrainHistoryItem[],
  opts?: { mock?: boolean; loved?: string[]; disliked?: string[] },
): Promise<{ tasteSummary: string; recommendations: { title: string; year?: string | number | null; reason: string }[] } | null> {
  const loved = opts?.loved || [];
  const disliked = opts?.disliked || [];
  if (opts?.mock || process.env.BRAIN_MOCK === '1') {
    // mock: recommend by strongest-liked genre names (grounded later by the route via pool)
    const liked: Record<string, number> = {};
    for (const h of history) for (const g of h.genres) liked[g] = (liked[g] || 0) + (h.rating - 3);
    const top = Object.entries(liked).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
    return { tasteSummary: `(mock) likes ${top.join(', ')}`, recommendations: top.map(g => ({ title: g, year: null, reason: `(mock) liked ${g}` })) };
  }
  const model = tasteModel();
  if (!model) return null;
  // The route has already DETERMINISTICALLY resolved which sub-genre(s) the user loves
  // (from their actual 4-5 ratings, scored per probed sub-genre) and which they hate.
  // The model's ONLY job here is to name 3 well-known titles squarely inside the loved
  // sub-genre — it does NOT get to re-decide the sub-genre. This removes the unreliable
  // per-turn LLM navigation that previously mislabeled slasher/hard-SF as "psychological".
  const lovedLine = loved.length
    ? `CONFIRMED loved sub-genre(s), in priority order: ${loved.join(', ')}. Recommend squarely inside the FIRST one.`
    : `No single sub-genre dominated; infer the best fit from the ratings below.`;
  const hateLine = disliked.length
    ? `CONFIRMED DISLIKED sub-genres (NEVER recommend, no overlap): ${disliked.join(', ')}.`
    : `No confirmed dislikes.`;
  const prompt = `A user rated these movies:
${fmtHistory(history)}

${lovedLine}
${hateLine}

Recommend EXACTLY 3 real, well-known movies that sit squarely IN the loved sub-genre
named above (NOT a broader umbrella genre, NOT an adjacent sub-genre), which the user
most likely has NOT already rated here. Each needs its release year and a one-line
reason citing the specific sub-genre. Do NOT recommend anything from a disliked
sub-genre. tasteSummary must name the precise loved sub-genre.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { object } = await generateObject({ model, schema: RecResult, system: SYSTEM, prompt, temperature: 0.4, abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS) });
      if (object.recommendations.length > 0) return object;
    } catch { /* retry */ }
  }
  return null;
}

// Natural-language recommendation REASON, written by the local model (default gemma2:27b —
// the only locally-available model that produces clean Hebrew without code-switching; qwen
// models drift into Chinese/French mid-sentence). The model writes ONLY the prose reason
// over an already-chosen film — it never picks the film, so it can't break the surgical
// selection. Falls back to a clean template if the model is unavailable.
export async function recReason(opts: { title: string; year?: string; term: string; locale: string; mock?: boolean }): Promise<string> {
  const { title, year, term, locale, mock } = opts;
  const fallback = locale === 'he' ? `בחירה קלאסית ומדויקת בסגנון ${term}` : `A canonical ${term} pick`;
  if (mock) return fallback;
  const model = tasteModel();
  if (!model) return fallback;
  const prompt = locale === 'he'
    ? `המשתמש אוהב סרטי ${term}. כתוב משפט אחד קצר בעברית טבעית בלבד (ללא מילים באנגלית או בשפות אחרות) שמסביר למה הוא יאהב את הסרט "${title}"${year ? ` (${year})` : ''}. החזר רק את המשפט עצמו, בלי הקדמה.`
    : `The user loves ${term} films. In ONE short, natural sentence, explain why they'll love "${title}"${year ? ` (${year})` : ''}. Return just the sentence.`;
  try {
    const { text } = await generateText({ model, prompt, temperature: 0.6, abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS) });
    const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim().replace(/^["']|["']$/g, '');
    return clean.slice(0, 240) || fallback;
  } catch { return fallback; }
}

// AI TASTE DIRECTOR: choose the final picks FROM A GIVEN LIST of real candidate films (so it
// can never hallucinate), steered by the user's actual loved/hated films. This is where the
// model reasons about franchise/studio/style the deterministic genre filter can't capture —
// e.g. "the user hated Marvel/DC, so never pick Guardians of the Galaxy even though Comedy is
// a genre they like." Returns chosen titles (a subset of `candidates`), or null to fall back.
export async function directRecs(opts: {
  candidates: string[]; lovedTitles: string[]; hatedTitles: string[]; term: string; n?: number; mock?: boolean;
}): Promise<string[] | null> {
  const { candidates, lovedTitles, hatedTitles, term, n = 3, mock } = opts;
  if (mock || candidates.length === 0) return null;
  const model = tasteModel();
  if (!model) return null;
  const prompt = `You are a film taste director. Choose EXACTLY ${n} movies FROM THIS LIST ONLY (copy each chosen title verbatim):
${candidates.map((t, i) => `${i + 1}. ${t}`).join('\n')}

The user's confirmed taste is "${term}".
LOVED: ${lovedTitles.length ? lovedTitles.join(', ') : '(see taste above)'}.
HATED: ${hatedTitles.length ? hatedTitles.join(', ') : '(none stated)'}.

Pick the ${n} that BEST match what they loved. NEVER pick anything that resembles — in
franchise, studio, or overall style — what they hated (e.g. if they hated Marvel/DC superhero
films, never pick a Marvel or superhero film, even one on the list). Return ONLY the chosen
titles, copied exactly from the list.`;
  try {
    const { object } = await generateObject({ model, schema: z.object({ picks: z.array(z.string()) }), prompt, temperature: 0.3, abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS) });
    const picks = object.picks.filter(p => candidates.includes(p)).slice(0, n);
    return picks.length ? picks : null;
  } catch { return null; }
}

// ── Deterministic mock brain (offline pipeline validation; no LLM) ────────────
function mockBrainStep(history: BrainHistoryItem[], pool: BrainCandidate[], minQ: number, maxQ: number): BrainResult {
  const liked: Record<string, number> = {};
  const seenGenre: Record<string, number> = {};
  for (const h of history) {
    for (const g of h.genres) {
      seenGenre[g] = (seenGenre[g] || 0) + 1;
      liked[g] = (liked[g] || 0) + (h.rating - 3);
    }
  }
  const likedGenres = Object.entries(liked).filter(([, v]) => v >= 2).map(([g]) => g);
  const dislikedGenres = Object.entries(liked).filter(([, v]) => v <= -2).map(([g]) => g);
  const enough = history.length >= minQ && likedGenres.length >= 2 && dislikedGenres.length >= 1;
  const summary = `(mock) likes ${likedGenres.join(', ') || '—'}; dislikes ${dislikedGenres.join(', ') || '—'}`;
  if (!enough && history.length < maxQ) {
    // pick the candidate whose genres are least-measured (coverage), avoiding disliked
    const score = (c: BrainCandidate) => c.genres.reduce((s, g) =>
      s + (dislikedGenres.includes(g) ? -5 : 1 / (1 + (seenGenre[g] || 0))), 0);
    const pick = [...pool].sort((a, b) => score(b) - score(a))[0] || pool[0];
    const confidence = Math.min(0.85, history.length / (minQ + 4));
    return { phase: 'ask', confidence, tasteSummary: summary, nextPickId: pick ? pick.id : null, nextReason: '(mock) covering an unmeasured genre', recommendations: [] };
  }
  // recommend from the pool the highest-liked-genre titles (grounded — real pool ids)
  const recScore = (c: BrainCandidate) => c.genres.reduce((s, g) => s + (liked[g] || 0), 0) - c.genres.filter(g => dislikedGenres.includes(g)).length * 100;
  const recs = [...pool].filter(c => !c.genres.some(g => dislikedGenres.includes(g))).sort((a, b) => recScore(b) - recScore(a)).slice(0, 3);
  return {
    phase: 'done', confidence: 0.9, tasteSummary: summary, nextPickId: null, nextReason: null,
    recommendations: recs.map(c => ({ title: c.title, year: c.year || null, reason: `(mock) matches liked ${c.genres.filter(g => likedGenres.includes(g)).join('/') || 'taste'}` })),
  };
}
