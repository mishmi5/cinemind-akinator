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
// The sub-genre names the engine works in are English, and they were being printed inside Hebrew
// sentences on the results screen: "בחירה קלאסית ומדויקת בסגנון spaghetti western", "כי אם אתה
// אוהב found-footage horror". Twenty-three of forty test quizzes ended with a line like that. The
// engine keeps its English terms; the customer reads Hebrew.
const HE_TERM: Record<string, string> = {
  'giallo': "ג'אלו איטלקי", 'slasher': 'סלאשר', 'splatter horror comedy': 'אימה-קומדיה עקובה מדם',
  'body horror': 'אימת גוף', 'zombie': 'זומבים', 'creature feature': 'מפלצות',
  'kaiju monster': 'מפלצות ענק', 'cosmic horror': 'אימה קוסמית',
  'found-footage horror': 'אימה בסגנון תיעוד מצולם', 'psychological horror': 'אימה פסיכולוגית',
  'supernatural horror': 'אימה על-טבעית', 'cosmic sci-fi epic': 'מד"ב חללי אפי',
  'hard science fiction': 'מד"ב קשה', 'cyberpunk': 'סייברפאנק', 'time travel': 'מסע בזמן',
  'space opera': 'אופרת חלל', 'stop-motion animation': 'אנימציית סטופ-מושן',
  'mecha anime': 'אנימת רובוטים', 'hand-drawn anime': 'אנימה מצוירת ביד',
  'wuxia': 'ווקסיה', 'martial arts': 'אמנויות לחימה', 'heist': 'סרטי שוד',
  'war epic': 'אפוס מלחמה', 'superhero': 'גיבורי-על', 'disaster': 'סרטי אסון',
  'spaghetti western': 'מערבון ספגטי', 'classic film noir': 'פילם נואר קלאסי',
  'psychological thriller': 'מותחן פסיכולוגי', 'whodunit mystery': 'תעלומת בלשים',
  'neo-noir': 'ניאו-נואר', 'cerebral spy thriller': 'מותחן ריגול איטי',
  'action spy thriller': 'מותחן ריגול אקשן', 'courtroom drama': 'דרמה משפטית',
  'erotic thriller': 'מותחן ארוטי', 'satire': 'סאטירה', 'black comedy': 'קומדיה שחורה',
  'deadpan comedy': 'קומדיה מאופקת', 'slapstick comedy': 'קומדיית סלפסטיק',
  'romantic comedy': 'קומדיה רומנטית', 'holiday christmas': 'סרטי חג',
  'coming-of-age': 'סרטי התבגרות', 'period costume drama': 'דרמה תקופתית',
  'sports drama': 'דרמת ספורט', 'slow cinema arthouse': 'קולנוע איטי ארטהאוס',
  'musical': 'מחזמר', 'epic high fantasy': 'פנטזיה אפית',
  'sword and sorcery fantasy': 'פנטזיית חרב וכישוף',
  'bittersweet romance': 'רומן מריר-מתוק', 'sweeping romance': 'רומן סוחף',
  'israeli cinema': 'קולנוע ישראלי', 'east asian drama': 'דרמה מזרח-אסייתית',
  'european arthouse': 'ארטהאוס אירופי', 'latin american cinema': 'קולנוע לטינו-אמריקאי',
  'indian cinema': 'קולנוע הודי', 'crime epic': 'אפוס פשע',
  'classic western': 'מערבון קלאסי', 'documentary feature': 'סרט תיעודי',
};
export const termInLocale = (term: string, locale: string) =>
  locale === 'he' ? (HE_TERM[term] || term) : term;

/** The written reason when the model is unavailable, times out, or comes back unusable.
 *  It names the user's OWN highest-rated film wherever we have one, so even the fallback says
 *  something about this person rather than only about the film. Exported because the caller needs
 *  the same sentence to replace a reason that came back too short or identical to another one.
 *  The seam this fixes: the caller used to pass the Hebrew words "הסגנון שלך" as the `term` for a
 *  film with no resolved sub-genre, and the template wrapped it in "בסגנון ...", so a real
 *  recommendation shipped reading "בחירה קלאסית ומדויקת בסגנון הסגנון שלך". An empty term now
 *  selects a sentence that does not have the word in it at all. */
export function recReasonFallback(opts: { title: string; term?: string; locale: string; loved?: string[]; variant?: number }): string {
  const { title, term = '', locale, loved = [], variant = 0 } = opts;
  const anchor = loved.find(t => t && t.trim());
  const heTerm = term ? termInLocale(term, locale) : '';
  // THE FALLBACK NEEDS SHAPES TOO. Varying the model's angle per card fixed nothing on the runs
  // where two cards fell back — the template had exactly one Hebrew form, so the screen showed
  // "אם אהבת את X…" three times over. Any card can fall back independently (a short answer, a
  // stock word, a code-switch), so the template has to carry the same three shapes the prompt asks
  // the model for, or it undoes them.
  const HE_ANCHORED = [
    (a: string) => `אם אהבת את "${a}", ${title} יושב כמעט באותו מקום.`,
    (a: string) => `${title} הולך לאותו מקום ש"${a}" לקח אותך אליו.`,
    (a: string) => `שונה מ"${a}" במה שקורה על המסך, קרוב אליו במה שנשאר אחר כך.`,
  ];
  if (locale === 'he') {
    if (anchor) return HE_ANCHORED[variant % HE_ANCHORED.length](anchor);
    if (heTerm) return `בחירה קלאסית בסגנון ${heTerm}, מהסוג שהדירוגים שלך הצביעו עליו.`;
    return `הבחירה הזאת יושבת על מה שדירגת הכי גבוה לאורך השאלון.`;
  }
  if (anchor) return `If "${anchor}" worked for you, ${title} lands in much the same place.`;
  if (term) return `A canonical ${term} pick, straight from what you rated highest.`;
  return `This one sits squarely on what you rated highest during the quiz.`;
}

export async function recReason(opts: { title: string; year?: string; term: string; locale: string; mock?: boolean; genres?: string[]; overview?: string; loved?: string[]; hated?: string[]; variant?: number }): Promise<string> {
  const { title, year, term, locale, mock, genres = [], overview = '', loved = [], hated = [], variant = 0 } = opts;
  // THREE CARDS, THREE SHAPES. Giving each card a different film to hang on was not enough: the
  // three calls still received an identical instruction, so the model settled on one phrasing and
  // wrote it three times — first "כי כמו ב…", and after that constraint was lifted, "תתחבר לסרט
  // הזה כמו…". A model asked the same question the same way answers it the same way. So the SHAPE
  // of the sentence is what varies per card, not just its subject matter.
  const ANGLES_HE = [
    'פתח בשם הסרט שהוא אהב, ומשם עבור לסרט המומלץ.',
    'פתח במה שהסרט המומלץ עושה, ורק אחר כך קשר אותו לסרט שהוא אהב.',
    'פתח בניגוד: מה שונה כאן מהסרט שהוא אהב, ולמה זה יעבוד עליו בכל זאת.',
  ];
  const ANGLES_EN = [
    'Open with the name of the film they loved, then move to this one.',
    'Open with what the recommended film does, and only then connect it to the film they loved.',
    'Open with the contrast: what is different here from the film they loved, and why it still works.',
  ];
  const angleHe = ANGLES_HE[variant % ANGLES_HE.length];
  const angleEn = ANGLES_EN[variant % ANGLES_EN.length];
  const heTerm = term ? termInLocale(term, locale) : '';
  // The films THIS person rated highest, and the ones they rejected. Without them the model knew
  // the film and nothing about the reader, so every reason was a description of the movie that
  // would have read the same for any two customers.
  const lovedTop = loved.filter(t => t && t.trim()).slice(0, 4);
  const hatedTop = hated.filter(t => t && t.trim()).slice(0, 3);
  const fallback = recReasonFallback({ title, term, locale, loved: lovedTop, variant });
  if (mock) return fallback;
  const model = tasteModel();
  if (!model) return fallback;
  // GROUND THE MODEL IN THE ACTUAL FILM. Without the real genres and synopsis it confabulated:
  // a Mississippi courtroom drama was recommended for its "spectacular battles". The reason is
  // the one screen that must be true, so the film's own facts go into the prompt and anything
  // outside them is forbidden.
  const facts = [genres.length ? `ז'אנרים: ${genres.join(', ')}` : '', overview ? `תקציר: ${overview.slice(0, 300)}` : '']
    .filter(Boolean).join(' · ');
  const factsEn = [genres.length ? `Genres: ${genres.join(', ')}` : '', overview ? `Synopsis: ${overview.slice(0, 300)}` : '']
    .filter(Boolean).join(' · ');
  const prompt = locale === 'he'
    ? `${heTerm ? `המשתמש אוהב סרטי ${heTerm}. ` : ''}הסרטים שהוא דירג הכי גבוה: ${lovedTop.join(', ') || '(אין)'}.${hatedTop.length ? `\nסרטים שהוא דחה: ${hatedTop.join(', ')}.` : ''}
הנה העובדות על הסרט "${title}"${year ? ` (${year})` : ''}:
${facts}

כתוב משפט אחד קצר בעברית טבעית בלבד (ללא מילים באנגלית או בשפות אחרות) שמסביר למה דווקא האדם הזה יתחבר לסרט הזה.
${angleHe}
חוקים: הזכר בשם את הסרט הראשון ברשימה שדירג גבוה, וקשר אותו לסרט המומלץ. אל תספר את העלילה ואל תסכם אותה — זו המלצה, לא תקציר. אל תמציא סצנות או פרטים שלא מופיעים בעובדות. אל תזכיר סרט שהוא דחה. פנה אל המשתמש בגוף שני ("תתחבר", "תאהב").
אסור להשתמש במילים: מרתק, מסע, לצלול, עדות ל, אבן דרך, בעידן שבו, עולם ומלואו, חוויה בלתי נשכחת.
החזר רק את המשפט עצמו.`
    : `${term ? `The user loves ${term} films. ` : ''}The films they rated highest: ${lovedTop.join(', ') || '(none)'}.${hatedTop.length ? `\nFilms they rejected: ${hatedTop.join(', ')}.` : ''}
Facts about "${title}"${year ? ` (${year})` : ''}:
${factsEn}

In ONE short natural sentence, explain why THIS person will love it. ${angleEn}
Name the first film in their list and connect it to this one. Use ONLY the facts above — do not
invent scenes, battles or details that are not there, and never mention a film they rejected.
Do not use: delve, tapestry, testament to, a journey, unforgettable, captivating. Return just the
sentence.`;
  try {
    const { text } = await generateText({ model, prompt, temperature: 0.6, abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS) });
    const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim().replace(/^["']|["']$/g, '');
    // gemma2 code-switches: a Hebrew sentence comes back with Latin fragments spliced in
    // ("הזombies בו מהירים"). On the flagship results screen that reads as a broken machine
    // translation, so fall back to the clean template rather than ship mixed script.
    // The code-switch guard used to reject ANY Latin character, but the sub-genre term and the
    // film's own name are English by nature — so a correct Hebrew sentence mentioning
    // "spaghetti western" was thrown away and the second and third cards fell back to the
    // template while the first got a real reason. Ignore the term and the title, then check.
    // Splitting on non-alphanumerics means every allowed word is already regex-safe.
    // Only the film's own NAME may stay Latin. The term used to be whitelisted here too, which is
    // how the English sub-genre name got a free pass into the Hebrew sentence.
    // The user's own film titles join the whitelist: the prompt asks the model to name one of
    // them, and many of those titles are English, so the guard would have thrown away precisely
    // the sentences it had just asked for.
    const allowed = [String(title), ...lovedTop].join(' ').split(/[^A-Za-z0-9]+/).filter(w => w.length > 1);
    const stripped = allowed.length ? clean.replace(new RegExp(allowed.join('|'), 'gi'), '') : clean;
    if (locale === 'he' && /[A-Za-z]/.test(stripped)) return fallback;
    // Two things the sentence has to earn its place with: enough of it to be a reason at all, and
    // a film of the user's own. The fallback satisfies both, so failing here costs nothing.
    if (clean.length < 40) return fallback;
    if (lovedTop.length && !lovedTop.some(t => clean.includes(t))) return fallback;
    // Telling a 9B model not to use a word is a request, not a guarantee — "מרתק" reached a shipped
    // results card despite the instruction above. These are the stock phrases that make Hebrew read
    // as machine-written, and the results screen is the one place the product has to sound like a
    // person. The template fallback is plain but never reaches for them.
    const STOCK_HE = ['מרתק', 'מסע', 'לצלול', 'עדות ל', 'אבן דרך', 'בעידן שבו', 'עולם ומלואו', 'בלתי נשכח'];
    const STOCK_EN = ['delve', 'tapestry', 'testament to', 'a journey', 'unforgettable', 'captivating'];
    const stock = locale === 'he' ? STOCK_HE : STOCK_EN;
    if (stock.some(w => clean.toLowerCase().includes(w.toLowerCase()))) return fallback;
    return clean.slice(0, 240);
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
