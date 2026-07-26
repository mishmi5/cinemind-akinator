import { MovieContext } from '@/types';

// Common Hebrew stop words
const HEBREW_STOP_WORDS = new Set([
  'את', 'של', 'על', 'אל', 'עם', 'היה', 'היו', 'היא', 'הוא', 'זה', 'זו', 'אבל', 'או', 'גם', 'רק', 'כדי', 'שלא', 'אם', 'כי', 'מה', 'מי', 'לו', 'לא', 'כן', 'עד', 'בין', 'כמו', 'כפי', 'אשר', 'אחר', 'שבו', 'שבה', 'בהם', 'בתוך', 'כל', 'חלק', 'שם', 'אחרי', 'יותר', 'לפני', 'אלו', 'כבר', 'ללא', 'כולל', 'כך', 'מכיוון', 'שלנו', 'שלהם', 'שלך'
]);

// Common English stop words
const ENGLISH_STOP_WORDS = new Set([
  'the', 'and', 'of', 'to', 'in', 'is', 'that', 'it', 'on', 'for', 'as', 'with', 'was', 'her', 'his', 'he', 'she', 'they', 'them', 'but', 'or', 'not', 'an', 'at', 'by', 'from', 'about', 'this', 'which', 'you', 'are', 'their', 'there', 'has', 'have', 'had', 'been', 'were', 'who', 'will', 'would', 'should', 'can', 'could'
]);

export const DECADE_PREFIX = 'decade:';
export const WORD_PREFIX = 'word:';
export const ATOMIC_WORD_WEIGHT = 1.0;
export const ATOMIC_DECADE_WEIGHT = 0.5;

/**
 * Extracts a decade string from originalDetails (e.g. "The Dark Knight · 2008" -> "2000s")
 */
export function extractDecade(originalDetails: string): string | null {
  const match = originalDetails.match(/·\s*(\d{4})/);
  if (match) {
    const year = parseInt(match[1], 10);
    if (!isNaN(year)) {
      const decadeStart = Math.floor(year / 10) * 10;
      return `${decadeStart}s`;
    }
  }
  return null;
}

/**
 * Tokenizes text and filters out stop words and short terms
 */
export function extractKeywords(title: string, overview: string): string[] {
  const combined = `${title} ${overview}`.toLowerCase();
  // Match letters and numbers across any language (Hebrew, English, etc.)
  const words = combined.match(/[\p{L}\p{N}]+/gu) || [];
  
  const filtered = words.filter(word => {
    if (word.length < 3) return false;
    if (HEBREW_STOP_WORDS.has(word)) return false;
    if (ENGLISH_STOP_WORDS.has(word)) return false;
    return true;
  });

  return Array.from(new Set(filtered));
}

/**
 * Calculates the Layer 3 atomic preference score (Decade + Keywords)
 */
export function scoreAtomicTaste(m: MovieContext, aff: Record<string, number>): number {
  let score = 0;

  // 1. Decade Preference
  const decade = extractDecade(m.originalDetails);
  if (decade) {
    score += (aff[`${DECADE_PREFIX}${decade}`] || 0) * ATOMIC_DECADE_WEIGHT;
  }

  // 2. Keyword Preference
  const keywords = extractKeywords(m.title, m.overview);
  if (keywords.length > 0) {
    let wordTotal = 0;
    let activeWordCount = 0;
    
    keywords.forEach(w => {
      const val = aff[`${WORD_PREFIX}${w}`] || 0;
      if (val !== 0) {
        wordTotal += val;
        activeWordCount++;
      }
    });

    if (activeWordCount > 0) {
      score += (wordTotal / activeWordCount) * ATOMIC_WORD_WEIGHT;
    }
  }

  return score;
}
