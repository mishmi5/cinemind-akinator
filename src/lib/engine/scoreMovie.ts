import { MovieContext } from '@/types';
import {
  extractDecade,
  extractKeywords,
  DECADE_PREFIX,
  WORD_PREFIX,
} from './atomicTaste';

// ─────────────────────────────────────────────────────────────────────────────
// Micro-genre key helpers (re-used by route.ts and selectNextQuestion.ts)
// ─────────────────────────────────────────────────────────────────────────────
export const MICRO_PREFIX = 'micro:';
export const isMicroKey = (k: string) => k.startsWith(MICRO_PREFIX);
export const microKey = (tag: string) => `${MICRO_PREFIX}${tag}`;

// ─────────────────────────────────────────────────────────────────────────────
// Micro-genre EXPOSURE counts (how many rated movies carried each micro-genre).
// Stored in the same affinities map under a distinct prefix so it round-trips
// through the API payload untouched. Used to compute *conviction* = the
// per-exposure average rating of a micro-genre, which separates a genuinely
// 5★-loved niche (avg ≈ +2) from a parent-genre "ride-along" tepidly rated 4★
// (avg ≈ +1). Raw affinity alone is frequency-biased: a broad genre served many
// times accumulates a high raw total without being a true preference.
// ─────────────────────────────────────────────────────────────────────────────
export const MICRO_COUNT_PREFIX = 'mcount:';
export const isMicroCountKey = (k: string) => k.startsWith(MICRO_COUNT_PREFIX);
export const microCountKey = (tag: string) => `${MICRO_COUNT_PREFIX}${tag}`;

/** Per-exposure average rating weight of a micro-genre (0 if never exposed). */
export function microConviction(aff: Record<string, number>, tag: string): number {
  const total = aff[microKey(tag)] || 0;
  const count = aff[microCountKey(tag)] || 0;
  if (count <= 0) return 0;
  return total / count;
}

// Threshold below which a parent genre counts as "clearly hated" (consistently
// rated 1★/2★). Exported so the recommendation pool can hard-exclude any movie
// carrying a hated parent genre — recommending such a film always reads as an
// engine mismatch to the user (and to the audit's fit scorer).
export const HATED_PARENT_REC_THRESHOLD = -3;

/** True if the movie carries ANY parent genre the user clearly hates. */
export function hasHatedParentGenre(
  movie: { _genreIds?: number[] },
  aff: Record<string, number>
): boolean {
  return (movie._genreIds ?? []).some(g => (aff[g.toString()] || 0) <= HATED_PARENT_REC_THRESHOLD);
}

// Parent-genre EXPOSURE counts — same idea as micro counts. Lets parent-genre
// scoring (Layer 5) use conviction (per-exposure average) instead of raw totals,
// so a broad genre served many times at a tepid 4★ doesn't outweigh a niche the
// user consistently rates 5★. Stored under a distinct prefix that round-trips
// through the API payload untouched.
export const GENRE_COUNT_PREFIX = 'gcount:';
export const isGenreCountKey = (k: string) => k.startsWith(GENRE_COUNT_PREFIX);
export const genreCountKey = (g: number | string) => `${GENRE_COUNT_PREFIX}${g}`;

/** Per-exposure average rating weight of a parent genre (raw fallback if uncounted). */
export function genreConviction(aff: Record<string, number>, g: number | string): number {
  const total = aff[g.toString()] || 0;
  const count = aff[genreCountKey(g)] || 0;
  if (count <= 0) return 0;
  return total / count;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔧 10-LAYER GODMODE TUNING CONSTANTS
// Affinities accumulate `answer - 3` (range -2..+2) per rated movie, so a genre
// reaches <= -3 after a couple of 1★/2★ hits and a beloved micro climbs past +6
// after a few 5★ hits. The thresholds below are calibrated against that scale.
// ─────────────────────────────────────────────────────────────────────────────

// Layer 1 — Hard exclusion of hated parent genres
const HATED_GENRE_THRESHOLD = -3;
const HATED_GENRE_PENALTY = -500;

// Layer 2 — Hard exclusion via hostile keywords
const HATED_KEYWORD_THRESHOLD = -3;
const HATED_KEYWORD_PENALTY = -50; // applied per matched hostile keyword

// Layer 3 — Normalized micro-genre affinity (averaged → no frequency bias)
const MICRO_WEIGHT = 1.5; // a specific micro signal counts more than a parent genre

// Layer 4 — Godmode micro-genre lock (genuinely-loved micro-genres)
// A micro-genre locks when (a) it has been seen enough to trust the signal and
// (b) its *conviction* (per-exposure average) shows the user consistently rates
// it highly — NOT merely that a broad parent genre piled up raw affinity by being
// served often. This is the frequency-bias fix: a ride-along micro tepidly rated
// 4★ averages ~+1 and never locks, while a true 5★ love averages ~+2 and locks.
// Calibrated against the per-exposure spread: parent-genre ride-along micros land
// ~0.4–0.65 (tepid 4★ diluted by hated co-genre 1★ hits), while genuinely loved
// micros land ~1.1–2.0. 0.8 sits in the gap, biased low so a true love that's been
// diluted by mixed co-tags still locks (false-negative is the failure mode here).
const GODMODE_AVG_THRESHOLD = 0.8;
const GODMODE_MIN_AFFINITY = 2; // raw floor so a single 5★ triggers drilling in Phase 2
const GODMODE_BONUS_SCALE = 25; // multiplied by the strongest locked conviction
const GODMODE_MAX_BONUS = 60; // cap so a single layer can't dominate everything

/** True when a micro-genre is a conviction-locked love (Layer 4 lock condition). */
function isGodmodeLocked(aff: Record<string, number>, tag: string): boolean {
  const raw = aff[microKey(tag)] || 0;
  return raw >= GODMODE_MIN_AFFINITY && microConviction(aff, tag) >= GODMODE_AVG_THRESHOLD;
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal-based completion — the engine should only finish when it genuinely KNOWS
// the user's preferred sub-genre (PM mandate: never reveal below ~97% certainty).
// "Knowing" = a micro-genre the user has CONSISTENTLY rated highly (conviction
// locked) over ENOUGH exposures with a strong raw total. Completing on real signal
// (instead of a random confidence counter) also makes the whole quiz deterministic,
// which removes stop-count fragility.
// ─────────────────────────────────────────────────────────────────────────────
export const CONFIDENT_RAW = 5;      // ~three consistent 5★ ratings of one micro
export const CONFIDENT_EXPOSURE = 3;  // seen on at least this many rated movies

/**
 * Returns the dominant conviction-locked sub-genre (the one the engine is now
 * confident about), or null if the engine is not yet sure. Ranked by conviction.
 */
export function confidentSubGenre(aff: Record<string, number>): string | null {
  let best: string | null = null;
  let bestConv = 0;
  for (const k of Object.keys(aff)) {
    if (!isMicroKey(k)) continue;
    const tag = k.slice(MICRO_PREFIX.length);
    const raw = aff[k] || 0;
    const exposure = aff[microCountKey(tag)] || 0;
    if (raw < CONFIDENT_RAW || exposure < CONFIDENT_EXPOSURE) continue;
    if (!isGodmodeLocked(aff, tag)) continue;
    const conv = microConviction(aff, tag);
    if (conv > bestConv) {
      bestConv = conv;
      best = tag;
    }
  }
  return best;
}

/** Top conviction-locked micros (for the selection engine to drill), best first. */
export function topConvictionMicros(aff: Record<string, number>, limit = 3): string[] {
  const locked: Array<{ tag: string; conv: number }> = [];
  for (const k of Object.keys(aff)) {
    if (!isMicroKey(k)) continue;
    const tag = k.slice(MICRO_PREFIX.length);
    if (isGodmodeLocked(aff, tag)) {
      locked.push({ tag, conv: microConviction(aff, tag) });
    }
  }
  locked.sort((a, b) => b.conv - a.conv);
  return locked.slice(0, limit).map(x => x.tag);
}

// Layer 5 — Dynamic parent-genre scaling (max-based + secondary bonus)
const OTHER_GENRE_BONUS_RATE = 0.15; // +15% for each additional positive parent genre

// Layer 6 — Temporal / decade alignment
const DECADE_LIKE_THRESHOLD = 2;
const DECADE_HATE_THRESHOLD = -2;
const DECADE_BONUS = 5;
const DECADE_PENALTY = -5;

// Layer 7 — Explicit positive-keyword boost (bilingual, frequency-bias safe)
const POSITIVE_KEYWORD_THRESHOLD = 2;
const KEYWORD_AVG_WEIGHT = 0.5; // weight on the *average* loved-keyword strength
const KEYWORD_BREADTH_CAP = 5; // cap how many loved keywords can add breadth bonus
const KEYWORD_BREADTH_RATE = 0.2; // small bonus per loved keyword (up to the cap)

// Layer 8 — Subscription & quality bias (soft tie-breaker, never overrides taste)
// Plan asks for "×0.5 or similar"; raw TMDB rating is 0–10, so ×0.5 would reach +5
// and could swamp a genuine taste gap. We use a deliberately gentle factor so this
// layer only ever decides between movies that are *already* taste-equivalent.
const QUALITY_WEIGHT = 0.1;
const DEFAULT_RATING = 5.0; // neutral fallback when a movie has no rating

// Layer 9 — Anti-repetitive recommendation diversity (applied in route.ts)
const DIVERSITY_SHARED_MICRO_PENALTY = 2; // per micro-genre shared with an earlier pick
const DIVERSITY_PARODY_PENALTY = 4; // extra penalty for repeating the "parody" micro
const PARODY_MICRO = 'parody';

/**
 * 🎯 10-Layer "Godmode" preference score for a single movie.
 *
 * Layers 1–8 are computed here (per-movie scoring). Layer 9 (cross-result
 * diversity) is exposed via {@link diversityPenalty} for the caller to apply
 * when assembling the final top-N list, and Layer 10 (locale / bilingual) is
 * satisfied upstream by the unicode tokenizer ({@link extractKeywords}) plus the
 * JSON-body transport in the API route (no header-based payloads).
 *
 * Frequency bias is neutralised three ways:
 *   • micro-genres   → averaged over the movie's tag count (Layer 3)
 *   • parent genres  → max-based scaling, not summed (Layer 5)
 *   • keywords       → averaged + breadth-capped (Layer 7)
 */
export function scoreMovie(m: MovieContext, aff: Record<string, number>): number {
  let score = aff['General'] || 0;

  const genreIds = m._genreIds ?? [];
  const microTags = m._microTags ?? [];

  // ── Layer 1: Hard exclusion — hated parent genres ──────────────────────────
  // Any genre the user clearly despises (<= -3) makes the whole movie a non-option.
  // Exception: if the movie also has a strongly loved parent genre (>= 2) or a strongly loved micro-genre (>= 2),
  // we do not apply the hard exclusion. Instead, we let the negative affinity naturally detract from the score.
  let hasHatedGenre = false;
  for (const g of genreIds) {
    const parentAff = aff[g.toString()] || 0;
    if (parentAff <= HATED_GENRE_THRESHOLD) {
      const hasLovedOverride = genreIds.some(otherG => (aff[otherG.toString()] || 0) >= 4) ||
                               microTags.some(t => isGodmodeLocked(aff, t));
      if (!hasLovedOverride) {
        score += HATED_GENRE_PENALTY;
        hasHatedGenre = true;
      } else {
        score -= 15; // mild penalty instead of hard block
      }
    }
  }

  // ── Keyword extraction (shared by Layers 2 & 7, computed once) ─────────────
  // \p{L}-based tokenizer → works identically for Hebrew and English (Layer 10).
  const keywords = extractKeywords(m.title, m.overview);

  // ── Layer 2: Hard exclusion — hostile keywords ─────────────────────────────
  // ── Layer 7: Explicit positive-keyword boost (frequency-bias safe) ─────────
  let lovedKeywordSum = 0;
  let lovedKeywordCount = 0;
  for (const w of keywords) {
    const val = aff[`${WORD_PREFIX}${w}`] || 0;
    if (val <= HATED_KEYWORD_THRESHOLD) {
      score += HATED_KEYWORD_PENALTY; // Layer 2
    } else if (val >= POSITIVE_KEYWORD_THRESHOLD) {
      lovedKeywordSum += val; // Layer 7
      lovedKeywordCount++;
    }
  }
  if (lovedKeywordCount > 0) {
    const avgLoved = lovedKeywordSum / lovedKeywordCount; // average → no length bias
    const breadth = Math.min(lovedKeywordCount, KEYWORD_BREADTH_CAP) * KEYWORD_BREADTH_RATE;
    score += avgLoved * KEYWORD_AVG_WEIGHT + breadth;
  }

  // ── Layer 3: Conviction-based micro-genre affinity ─────────────────────────
  // Use per-exposure CONVICTION, not raw totals: a broad micro served many times
  // at a tepid 4★ (conviction ≈1) must not outweigh a niche the user consistently
  // 5★-loves (conviction ≈2). Reward the strongest-conviction micro fully + a
  // small share of the others, and subtract negative-conviction (disliked) micros.
  if (microTags.length > 0) {
    const convs = microTags.map(t => microConviction(aff, t));
    const pos = convs.filter(c => c > 0).sort((a, b) => b - a);
    const negSum = convs.filter(c => c < 0).reduce((s, c) => s + c, 0);
    if (pos.length > 0) {
      const maxC = pos[0];
      const otherSum = pos.slice(1).reduce((s, c) => s + c, 0);
      score += MICRO_WEIGHT * (maxC + OTHER_GENRE_BONUS_RATE * otherSum + negSum);
    } else {
      score += MICRO_WEIGHT * negSum;
    }
  }

  // ── Layer 4: Godmode micro-genre lock (conviction-based, single-best) ──────
  // Reward the SINGLE strongest conviction-locked micro on this movie, scaled by
  // that conviction. Using the max (not the sum) avoids over-rewarding multi-tag
  // films: a movie carrying the user's true 5★ love (conviction ≈2) beats one that
  // merely shares a lower-conviction "passenger" micro (≈1.1), and a mainstream
  // film whose micros never lock gets nothing.
  let bestConviction = 0;
  for (const t of microTags) {
    if (isGodmodeLocked(aff, t)) {
      const c = microConviction(aff, t);
      if (c > bestConviction) bestConviction = c;
    }
  }
  if (bestConviction > 0) {
    score += Math.min(bestConviction * GODMODE_BONUS_SCALE, GODMODE_MAX_BONUS);
  }

  // ── Layer 5: Dynamic parent-genre scaling ──────────────────────────────────
  // Reward the single strongest matching genre fully, add a small share of the
  // others, and subtract mildly-disliked genres. Genres already hard-excluded in
  // Layer 1 are skipped here to avoid double-counting.
  if (genreIds.length > 0) {
    // Conviction-based: same frequency-bias fix as Layer 3. A broad genre served
    // often at a tepid 4★ has conviction ≈1, so it can't dominate a niche genre
    // the user consistently rates higher.
    const positiveVals: number[] = [];
    let negativeSum = 0;
    for (const g of genreIds) {
      const raw = aff[g.toString()] || 0;
      if (raw <= HATED_GENRE_THRESHOLD) continue; // handled by Layer 1
      const conv = genreConviction(aff, g);
      if (conv > 0) positiveVals.push(conv);
      else if (conv < 0) negativeSum += conv;
    }
    if (positiveVals.length > 0) {
      positiveVals.sort((a, b) => b - a); // descending
      const maxVal = positiveVals[0];
      const otherSum = positiveVals.slice(1).reduce((s, v) => s + v, 0);
      score += maxVal + OTHER_GENRE_BONUS_RATE * otherSum + negativeSum;
    } else {
      score += negativeSum;
    }
  }

  // ── Layer 6: Temporal / decade alignment ───────────────────────────────────
  const decade = extractDecade(m.originalDetails);
  if (decade) {
    const decadeAff = aff[`${DECADE_PREFIX}${decade}`] || 0;
    if (decadeAff >= DECADE_LIKE_THRESHOLD) score += DECADE_BONUS;
    else if (decadeAff <= DECADE_HATE_THRESHOLD) score += DECADE_PENALTY;
  }

  // ── Layer 8: Subscription & quality bias (soft tie-breaker) ────────────────
  const rating = typeof m.rating === 'number' && !isNaN(m.rating) ? m.rating : DEFAULT_RATING;
  score += rating * QUALITY_WEIGHT;

  return score;
}

/**
 * 🎲 Layer 9 — Anti-repetitive recommendation diversity.
 *
 * Pure helper for the caller (route.ts) to apply while picking the final top-N
 * one by one: a candidate that repeats micro-genres already present in earlier
 * picks is penalised, with an extra hit for repeating "parody", so the final
 * three recommendations feel like genuinely different films rather than three
 * spins on the same niche.
 *
 * Returns a NEGATIVE number (the penalty) to add to the candidate's score, or 0.
 */
export function diversityPenalty(
  candidate: MovieContext,
  alreadySelected: MovieContext[],
  aff?: Record<string, number>
): number {
  const candidateTags = candidate._microTags;
  if (!candidateTags || candidateTags.length === 0 || alreadySelected.length === 0) {
    return 0;
  }

  const seenTags = new Set<string>();
  for (const picked of alreadySelected) {
    for (const t of picked._microTags ?? []) seenTags.add(t);
  }
  if (seenTags.size === 0) return 0;

  let penalty = 0;
  for (const t of candidateTags) {
    if (seenTags.has(t)) {
      // If this micro-genre is a conviction-locked love, do NOT penalize repeats!
      if (aff && isGodmodeLocked(aff, t)) {
        continue;
      }
      penalty -= DIVERSITY_SHARED_MICRO_PENALTY;
      if (t === PARODY_MICRO) penalty -= DIVERSITY_PARODY_PENALTY;
    }
  }
  return penalty;
}
