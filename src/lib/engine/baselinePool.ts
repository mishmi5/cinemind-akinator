import type { MovieContext } from '@/types';

// Curated exploration pool — 12 taste buckets x 2-3 candidates each.
// Every entry was verified against live TMDB (id, poster path, titles,
// genres) on 2026-06-12 — stale hardcoded poster paths previously showed
// WRONG posters (Se7en rendered Detective Pikachu art). Genre arrays are
// ordered signature-genre-first so the bucket's axis carries primary weight.
//
// Per-session rotation: one candidate per bucket, seeded by sessionId —
// every quiz covers all 12 taste axes (accuracy) with a different movie mix
// and order (variety). Same session = same picks (Back/refresh stable).

export interface BaselineCandidate {
  id: string; he: string; en: string; year: string; rating: number;
  poster: string; genres: number[]; overviewHe: string;
}

export const BASELINE_BUCKETS: { bucket: string; candidates: BaselineCandidate[] }[] = [
  { bucket: "action", candidates: [
    { id: "155", he: "האביר האפל", en: "The Dark Knight", year: "2008", rating: 8.5, poster: "/3KAtr9OX8Bq2FAvZtrjYcdUuBYp.jpg", genres: [28, 80, 53], overviewHe: "באטמן, פקד גורדון והתובע הכללי הארווי דנט מתייצבים מול הג'וקר, מוח קרימינלי מאופר ודוחה שמ" },
    { id: "76341", he: "מקס הזועם: כביש הזעם", en: "Mad Max: Fury Road", year: "2015", rating: 7.6, poster: "/rlfnoJJA7Uj3NZX4zMf4OxPPlbY.jpg", genres: [28, 12, 878], overviewHe: "נרדף על ידי עברו, מקס רוקטנסקי משוטט לבדו עד שהוא נאסף על ידי קבוצת מורדים, המונהגת על ידי" },
    { id: "245891", he: "ג'ון וויק", en: "John Wick", year: "2014", rating: 7.5, poster: "/xMPKz98AFNHG1Qi9gigAPb2N2YT.jpg", genres: [28, 53], overviewHe: "ג'ון וויק הוא מתנקש לשעבר בשירות המאפיה הרוסית, אשר איבד את אשתו למחלת הסרטן, וכעת מנסה לה" },
  ] },
  { bucket: "scifi", candidates: [
    { id: "603", he: "מטריקס", en: "The Matrix", year: "1999", rating: 8.2, poster: "/xC1MsxS9wJ3EcBjIRJv8PkhFtzJ.jpg", genres: [878, 28], overviewHe: "מהו המטריקס? שאלה מצוינת. החיפוש אחר תשובה מוביל את ניאו ההאקר אל נבכי מחילת הארנב ואל האמ" },
    { id: "27205", he: "התחלה", en: "Inception", year: "2010", rating: 8.4, poster: "/nPO8aNT4uGtDAY0bZZZACfP66Lo.jpg", genres: [878, 28, 12], overviewHe: "דום קוב הוא הגנב הטוב ביותר בתחומו. הוא מתמחה בשליפת מחשבות מהתת מודע של אנשים בזמן שהם יש" },
    { id: "335984", he: "בלייד ראנר 2049", en: "Blade Runner 2049", year: "2017", rating: 7.6, poster: "/tp0q9Y5h8aPsRKLZvJvejukAjKK.jpg", genres: [878, 18], overviewHe: "שלושים שנים לאחר אירועי הסרט הראשון, יש בלייד ראנר חדש – קיי, שוטר במשטרת לוס אנג'לס (ריאן" },
  ] },
  { bucket: "space", candidates: [
    { id: "157336", he: "בין כוכבים", en: "Interstellar", year: "2014", rating: 8.5, poster: "/9W7qYnmi1W3648YXVJvpjk82MUf.jpg", genres: [878, 12, 18], overviewHe: "בעוד שעתנו על כדור הארץ קרבה לקצה, צוות חוקרים יוצא למשימה החשובה ביותר בהיסטוריה של המין " },
    { id: "286217", he: "להציל את מארק וואטני", en: "The Martian", year: "2015", rating: 7.7, poster: "/oxt3bUChhTZJmYJ7F579J0k9AVy.jpg", genres: [878, 18, 12], overviewHe: "במהלך משימה למאדים, האסטרונאוט מארק וואטני נחשב למת אחרי סערת על וננטש בידי הצוות שלו. אבל" },
    { id: "49047", he: "כח משיכה", en: "Gravity", year: "2013", rating: 7.2, poster: "/7svpqmgUVxYWta2pLcoRPewa6lJ.jpg", genres: [878, 53, 18], overviewHe: "דר' ראיין סטון היא מהנדסת רפואית מבריקה בטיסתה הראשונה לחלל עם האסטרונאוט הוותיק מאט קובלס" },
  ] },
  { bucket: "romance", candidates: [
    { id: "11036", he: "היומן", en: "The Notebook", year: "2004", rating: 7.9, poster: "/s4kMNZZwJ0LXnR6iHpDMfuehhHe.jpg", genres: [10749, 18], overviewHe: "דרמה רומנטית תקופתית העוקבת אחר קורותיהם של זוג צעירים שנפגשים בקרנבל בארה\"ב של שנות ה-40'" },
    { id: "313369", he: "לה לה לנד", en: "La La Land", year: "2016", rating: 7.9, poster: "/tqXBnjJLIO1E4rxxh79oO9F2w1A.jpg", genres: [10749, 35, 18], overviewHe: "מיה היא מלצרית בבית קפה באולפני האחים וורנר החולמת להיות שחקנית וסבסטיאן הוא נגן פסנתר תפר" },
    { id: "597", he: "טיטניק", en: "Titanic", year: "1997", rating: 7.9, poster: "/ob0CMseAea7cHPBJbTxT6V0kMt8.jpg", genres: [10749, 18], overviewHe: "סיפור אהבה בין מעמדי בין צעירה אריסטוקרטית לצייר נווד על סיפונה של אוניית הפאר טיטניק. שיח" },
  ] },
  { bucket: "family", candidates: [
    { id: "862", he: "צעצוע של סיפור", en: "Toy Story", year: "1995", rating: 8.0, poster: "/oLII3pJFSfeLFDKCZbaUIAXEqqz.jpg", genres: [16, 10751, 35, 12], overviewHe: "שתי בובות - הקאובוי וודי, הצעצוע האהוב על הילד אנדי; ומגן החלל באז שנות אור, הצעצוע החדש ו" },
    { id: "129", he: "המסע המופלא", en: "Spirited Away", year: "2001", rating: 8.5, poster: "/hagRqkTsnvwBAy1REmuqyIyP3F2.jpg", genres: [16, 10751, 14], overviewHe: "כשהוריה מחליטים לעבור דירה, צ'יהירו נאלצת להיפרד מחבריה. היא מאד עצובה וכועסת על כך, והיא " },
    { id: "14160", he: "למעלה", en: "Up", year: "2009", rating: 8.0, poster: "/mliyL5DqXgdEirkMEtBFZCD4oA.jpg", genres: [16, 35, 10751, 12], overviewHe: "קארל פרדריקסן, זקן בן 78, בזבז את כל חייו בחלימה על גילוי ארצות. אך יום אחד, קארל מוצא עצמ" },
  ] },
  { bucket: "horror", candidates: [
    { id: "4232", he: "צעקה", en: "Scream", year: "1996", rating: 7.4, poster: "/lr9ZIrmuwVmZhpZuTCW8D9g0ZJe.jpg", genres: [27, 80, 9648], overviewHe: "שנה לאחר מות אמה של סידני, שני תלמידים נמצאים מתים. כשרוצח סדרתי מופיע, סידני מתחילה לחשוד" },
    { id: "138843", he: "לזמן את הרוע", en: "The Conjuring", year: "2013", rating: 7.5, poster: "/b5T4nZV6Hfl0JhxCbyTVh0HMeXm.jpg", genres: [27, 53], overviewHe: "\"לזמן את הרוע\", מספר את סיפורם של צמד חוקרים ידוע – אד ולוריין וורן, שהתמקדו במקרים על-טבע" },
    { id: "447332", he: "מקום שקט", en: "A Quiet Place", year: "2018", rating: 7.4, poster: "/2WiIhg8IbxZZNrio7Ww2JAbqscg.jpg", genres: [27, 18, 878], overviewHe: "משפחה חיה בשתיקה מוחלטת ביער מרוחק מהעיר הגדולה. לאחר שכדור הארץ הותקף בידי יצורים רצחניים" },
  ] },
  { bucket: "horror2", candidates: [
    { id: "22970", he: "בקתת הפחד", en: "The Cabin in the Woods", year: "2012", rating: 6.7, poster: "/zZZe5wn0udlhMtdlDjN4NB72R6e.jpg", genres: [27, 9648, 35], overviewHe: "\"בקתת הפחד\" מציג עלילה נדושה למדי - סיפורם של חמישה צעירים היוצאים לבקתה מרוחקת, וכנהוג בז" },
    { id: "419430", he: "תברח", en: "Get Out", year: "2017", rating: 7.6, poster: "/jFmHgPS9KTqwqLak3NTsCIV0HmA.jpg", genres: [27, 9648, 53], overviewHe: "כריס ורוז הם זוג צעיר שנוסעים לפגוש לראשונה את הוריה של רוז. כריס חושש מתגובת ההורים מאחר " },
  ] },
  { bucket: "mystery", candidates: [
    { id: "807", he: "שבעה חטאים", en: "Se7en", year: "1995", rating: 8.4, poster: "/rlN6fU33s3Y7ZBa5zACkIdaHqQU.jpg", genres: [9648, 80, 53], overviewHe: "דיוויד מילס הצטוות לשותפו החדש בזמן לא טוב. הבלש סומרסט המבוגר עומד לפרוש בעוד כמה ימים ור" },
    { id: "546554", he: "רצח כתוב היטב", en: "Knives Out", year: "2019", rating: 7.8, poster: "/f0sT6jD2sEeIN4jgmid3QFFIUrz.jpg", genres: [9648, 35, 80], overviewHe: "כשסופר ידוע נמצא מת באחוזתו, בלש מהולל מצורף לחקירה. עתה עליו לנווט בין הסחות דעת והשקרים " },
    { id: "1949", he: "זודיאק", en: "Zodiac", year: "2007", rating: 7.5, poster: "/rdsYVYH5RyEYlg5wXbQdwxv28xl.jpg", genres: [9648, 80, 53], overviewHe: "מותחן המבוסס על סיפור אמיתי. קריקטוריסט פוליטי, כתב פשע וזוג שוטרים חוקרים את רוצח הזודיאק" },
  ] },
  { bucket: "crime", candidates: [
    { id: "680", he: "ספרות זולה", en: "Pulp Fiction", year: "1994", rating: 8.5, poster: "/hBS14aC5tyUasDhMGy0ihvp8hTB.jpg", genres: [80, 53, 35], overviewHe: "מקבץ של סיפורים השזורים אחד בשני המתחיל בזוג גנבים ששודד בית קפה תמים למדי וממשיך בסיפורם " },
    { id: "769", he: "החבר'ה הטובים", en: "GoodFellas", year: "1990", rating: 8.5, poster: "/z8FYfAiKcwHaciuLNVZsR9x0doJ.jpg", genres: [80, 18], overviewHe: "יותר מכל סרטי הגנגסטרים של שנות השמונים והתשעים, מסמן סרטו של סקורסזה את תחייתו של הז'אנר." },
    { id: "107", he: "סנאץ׳", en: "Snatch", year: "2000", rating: 7.8, poster: "/nKw8SeOR2RpkkLLUXAvpSWCcICC.jpg", genres: [80, 35], overviewHe: "גנגסטר שמעביר יהלום גנוב מצית בטעות שרשרת אירועים שמשפיעה על סוכני הימורים, על מתאגרפים בי" },
  ] },
  { bucket: "drama", candidates: [
    { id: "238", he: "הסנדק", en: "The Godfather", year: "1972", rating: 8.7, poster: "/dR1ALiaiDz7GDZXSFfwaqBIkCl9.jpg", genres: [18, 80], overviewHe: "הסרט מגולל את סיפורה של משפחת קורליאונה, שהיא אחת מהמשפחות השולטות על המאפיה הסיצליאנית בנ" },
    { id: "278", he: "חומות של תקווה", en: "The Shawshank Redemption", year: "1994", rating: 8.7, poster: "/nZPmmw6CFaYv2CwXGf7qX3imU3o.jpg", genres: [18, 80], overviewHe: "בבית כלא שמור נרקמת חברות יוצאת דופן בין אסיר ותיק לצעיר, שמעולם לא ויתר על התקווה." },
    { id: "496243", he: "פרזיטים", en: "Parasite", year: "2019", rating: 8.5, poster: "/6imi6c5zBRbOhp6EnIqLs2Ele6A.jpg", genres: [18, 35, 53], overviewHe: "\"פרזיטים\", סרטו המדובר של הבמאי הקוריאני בונג ג'ון-הו שהתקבל בתשואות בפסטיבל קאן האחרון וא" },
  ] },
  { bucket: "epic", candidates: [
    { id: "98", he: "גלדיאטור", en: "Gladiator", year: "2000", rating: 8.2, poster: "/zJjf7dAIBBHsJjK6L38D3bzOWek.jpg", genres: [12, 28, 18], overviewHe: "כשגנרל רומאי נבגד ומשפחתו נרצחת בידי נסיך מושחת, הוא מגיע לרומא בתור גלדיאטור על מנת לחפש " },
    { id: "120", he: "שר הטבעות: אחוות הטבעת", en: "The Lord of the Rings: The Fellowship of the Ring", year: "2001", rating: 8.4, poster: "/K1IXwSwrxENEKN51Hj86ETxmIW.jpg", genres: [12, 14, 28], overviewHe: "ההוביט פרודו מקבל משימה מסוכנת להעביר טבעת פלאים לארץ החושך, על מנת להשמידה לדיראון עולם, " },
    { id: "85", he: "אינדיאנה ג'ונס ושודדי התיבה האבודה", en: "Raiders of the Lost Ark", year: "1981", rating: 7.9, poster: "/i0DTA0vJH1hA8dp978BLXQSW4g5.jpg", genres: [12, 28], overviewHe: "ד\"ר אינדיאנה ג'ונס יוצא בעקבות התיבה האבודה, האמורה להחזיק בתוכה את לוחות הברית המקוריות כ" },
  ] },
  { bucket: "comedy", candidates: [
    { id: "8363", he: "סופרבאד: חרמן על הזמן", en: "Superbad", year: "2007", rating: 7.3, poster: "/zZvTgQnqQEcwrMhPsAJh5qhjkJR.jpg", genres: [35], overviewHe: "השעון מתקתק, ימי הקולג' מתקרבים, וסת' ואוואן פשוט חייבים לאבד את הבתולין לפני שהפדיחה תתפח" },
    { id: "18785", he: "בדרך לחתונה עוצרים בווגאס", en: "The Hangover", year: "2009", rating: 7.3, poster: "/nAG8HWpFj4vxkhYQocsVB1LHggj.jpg", genres: [35], overviewHe: "במרכז העלילה ניצבים ארבעה חברים שמתעוררים בלאס וגאס עם תינוק לא מוכר, תרנגול, נמר ושן שבור" },
    { id: "120467", he: "מלון גרנד בודפשט", en: "The Grand Budapest Hotel", year: "2014", rating: 8.0, poster: "/8d4M65elKwcwPhAb3XOofs14dMh.jpg", genres: [35, 18], overviewHe: "הרפתקאותיו של גוסטב ה., שוער אגדי של בית מלון אירופאי מפורסם בין שתי מלחמות העולם, ושל מוס" },
  ] },
];

const GENRE_EGG: Record<number, 'oscar' | 'blood' | 'wazzap' | 'matrix'> = {
  28: 'oscar', 12: 'oscar', 16: 'oscar', 35: 'wazzap', 80: 'oscar', 18: 'oscar',
  14: 'oscar', 27: 'blood', 9648: 'blood', 878: 'matrix', 53: 'blood', 10749: 'oscar', 10751: 'oscar'
};

// Deterministic PRNG so a session always sees the same rotation.
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function candidateToMovie(c: BaselineCandidate, locale: string): MovieContext {
  return {
    id: c.id,
    title: locale === 'en' ? c.en : c.he,
    originalDetails: `${c.en} · ${c.year}`,
    rating: c.rating,
    posterUrl: `/api/poster?path=${c.poster}`,
    overview: c.overviewHe,
    trailerId: '',
    easterEgg: { type: GENRE_EGG[c.genres[0]] || 'oscar' },
    _genreIds: c.genres,
  };
}

/**
 * Session-stable exploration plan: pick one candidate per bucket and shuffle
 * the bucket order, both seeded by sessionId. Coverage is guaranteed (all 12
 * taste axes measured), variety is guaranteed (different movies + order every
 * session), and no movie can repeat (one per bucket + askedIds filter).
 */
export function getBaselinePlan(sessionId: string, locale: string): MovieContext[] {
  const rng = mulberry32(hashStr(sessionId || 'anon'));
  const picks = BASELINE_BUCKETS.map(b => b.candidates[Math.floor(rng() * b.candidates.length)]);
  // Fisher-Yates with the same seeded rng
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  return picks.map(c => candidateToMovie(c, locale));
}

export function pickBaselineMovie(sessionId: string, askedMovieIds: string[], locale: string): MovieContext | null {
  const plan = getBaselinePlan(sessionId, locale);
  return plan.find(m => !askedMovieIds.includes(m.id)) || null;
}

/** Full flat pool (all candidates) — emergency fallback when TMDB is unreachable. */
export function fullBaselinePool(locale: string): MovieContext[] {
  return BASELINE_BUCKETS.flatMap(b => b.candidates).map(c => candidateToMovie(c, locale));
}