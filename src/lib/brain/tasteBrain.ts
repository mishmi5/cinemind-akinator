import { generateObject } from 'ai';
import { z } from 'zod';
import { tasteModel } from './model';

// ── The taste brain (Akinator-style LLM reasoner) ────────────────────────────
// Given the user's rating history and a pool of REAL TMDB candidate movies, the
// model either picks the single most-revealing next movie to ask about, or — once
// it genuinely understands the taste at SUB-GENRE resolution — returns ranked
// recommendations. It never invents data: questions are chosen from the supplied
// pool, and recommendations are grounded against TMDB by the caller.

export interface BrainHistoryItem {
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
  nextPickId: z.string().nullable().describe('When phase="ask": the id (from the provided candidate pool) of the movie that will MOST narrow/resolve the taste. Null when phase="done".'),
  nextReason: z.string().nullable().describe('When phase="ask": short reason this movie best separates your live hypotheses. Null when done.'),
  recommendations: z.array(z.object({
    title: z.string(),
    year: z.string().nullable(),
    reason: z.string().describe('Why this fits the demonstrated taste, referencing specific sub-genre evidence.'),
  })).describe('When phase="done": exactly 3 movies the user likely has NOT seen but will love. Empty array when phase="ask".'),
});

export type BrainResult = z.infer<typeof BrainResult>;

const SYSTEM = `You are CineMind, a world-class film-taste expert running an Akinator-style quiz.
Your job: from a user's 1-5 star ratings, deduce their taste and recommend movies they'll love.

CORE PRINCIPLES (follow exactly):
1. SUB-GENRE RESOLUTION — this is the whole game. Loving ONE film of a genre does NOT
   mean loving the genre. Liking "Scream" might mean liking SLASHERS, or META/self-aware
   horror, not horror in general. Apply this to EVERY genre: comedy (satire vs slapstick
   vs cringe vs rom-com), sci-fi (cyberpunk vs space-opera vs hard-SF vs dystopia),
   action (martial-arts vs heist vs war vs superhero), drama (character study vs epic),
   etc. Always push to the most specific pattern the evidence supports — sub-genre, mood,
   era, pacing, tone, even director/franchise affinities.
2. RATINGS ARE LITERAL — 5 = loves it, 1 = actively dislikes that style, 3 = neutral.
   A low rating must steer you AWAY from that style; a high rating toward it.
3. RESOLVE BY CONTRAST — pick the next movie that best SEPARATES your live hypotheses
   (e.g. they liked a slasher → ask about a supernatural horror to test "slasher vs
   horror"). Maximize information gain; never ask about something already settled.
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
}): Promise<BrainResult | null> {
  const { history, pool, minQuestions = 6, maxQuestions = 30 } = opts;

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

Pacing guidance: you have asked ${history.length} questions. Don't finish before ~${minQuestions} unless the taste is already crystal-clear and consistent; you may keep going up to ~${maxQuestions} if the taste is still ambiguous or contradictory. Decide phase honestly based on whether you truly understand this person's taste at sub-genre resolution.`;

  try {
    const { object } = await generateObject({
      model,
      schema: BrainResult,
      system: SYSTEM,
      prompt,
      temperature: 0.4,
    });
    return object;
  } catch (e) {
    // A flaky/unstructured local model shouldn't crash the quiz — let the caller fall back.
    return null;
  }
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
