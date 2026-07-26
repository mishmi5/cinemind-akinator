import { MovieContext } from '@/types';
import { BucketedDeck } from './movieDeck';
import { scoreMovie, microKey, microConviction, topConvictionMicros, hasHatedParentGenre } from './scoreMovie';
import { shuffleWithSeed } from './prng';

/**
 * Quiz phases — Claude Code Opus 4.8 architecture (3-phase system):
 *
 * PHASE 1 — EXPLORE (Q0-Q11, 12 questions)
 *   Walk through ALL genre buckets in a RANDOMIZED order (based on session seed).
 *   Goal: build initial affinity signal across all micro-genres. No assumptions yet.
 *
 * PHASE 2 — CONFIRM (Q12-Q29, 18 questions)
 *   Drill into the top 2-3 micro-genres by affinity score.
 *   Serve movies with the highest-confidence micro-genre tags to solidify signal.
 *
 * PHASE 3 — EXCLUDE (Q30+, until isComplete)
 *   Explicitly probe hated genres to confirm exclusions, then finalize.
 *   Also continues confirming top micro-genres, but tests boundary cases.
 */

const PHASE1_END = 7;  // Q0-Q6 = explore (1 question per main bucket)
const PHASE2_END = 30;  // Q7-Q29 = confirm
// Q30+ = exclude/finalize

const EXPLORE_BUCKET_ORDER = ['action', 'comedy', 'horror', 'drama', 'scifi', 'animation', 'general'];

/**
 * Deterministically selects the next movie to ask about.
 *
 * @param shuffledBuckets Movie deck divided into buckets, each bucket shuffled with session seed
 * @param asked Set of movie IDs already asked in this session
 * @param affinities Running genre scores
 * @param questionIdx 0-based question number
 * @param flatShuffledDeck Flat list of all movies in the deck, shuffled with session seed
 * @param seed Session seed — used to randomize the opener order (Claude Code: must randomize per session)
 */
export function selectNextQuestion(
  shuffledBuckets: BucketedDeck,
  asked: Set<string>,
  affinities: Record<string, number>,
  questionIdx: number,
  flatShuffledDeck: MovieContext[],
  seed: number = 12345
): MovieContext | null {

  // ── PHASE 1: EXPLORE ─────────────────────────────────────────────────────
  // Randomized opener order (Claude Code fix: NOT hardcoded action→comedy→horror)
  if (questionIdx < PHASE1_END) {
    // Shuffle the bucket order with the session seed so every session sees different opener
    const shuffledBucketOrder = shuffleWithSeed([...EXPLORE_BUCKET_ORDER], seed + 999);
    // Repeat the list to cover 12 questions (7 buckets → pad with top picks again)
    const paddedOrder = [
      ...shuffledBucketOrder,
      shuffledBucketOrder[0],
      shuffledBucketOrder[1],
      shuffledBucketOrder[2],
      shuffledBucketOrder[3],
      shuffledBucketOrder[4],
    ].slice(0, PHASE1_END);

    const targetBucketName = paddedOrder[questionIdx];
    const bucket = shuffledBuckets[targetBucketName as keyof BucketedDeck] || [];
    const movie = bucket.find(m => !asked.has(m.id));
    if (movie) return movie;
    // Fallback: any unasked from flat deck
  }

  // ── PHASE 2+: CONFIRM / DRILL THE NICHE ──────────────────────────────────
  // From Q12 onward, drill the user's top-CONVICTION micro-genres (per-exposure
  // average), NOT raw totals. Raw totals are frequency-biased: a broad parent
  // genre served many times piles up a high raw score without being a true love,
  // and the old "drill top-raw" logic fed that back into the question stream,
  // starving the genuine niche of exposure. Conviction surfaces the real love.
  //
  // This replaces BOTH the old fixed Phase-2 window and the old Phase-3 weak-genre
  // probe (the probe inflated unrelated parent genres on long quizzes).
  if (questionIdx >= PHASE1_END) {
    // Hated micros: consistently disliked (negative conviction with real exposure).
    const topHated = Object.entries(affinities)
      .filter(([k]) => k.startsWith('micro:'))
      .map(([k]) => k.replace('micro:', ''))
      .filter(tag => microConviction(affinities, tag) <= -1);

    const topLoved = topConvictionMicros(affinities, 3);

    if (topLoved.length > 0) {
      // Prioritize the micro-genres in order of conviction (most convicted first)
      for (const targetMicro of topLoved) {
        const confirmCandidates = flatShuffledDeck.filter(m => {
          if (asked.has(m.id)) return false;
          if (hasHatedParentGenre(m, affinities)) return false;
          const tags = m._microTags || [];
          return tags.includes(targetMicro) && !tags.some(t => topHated.includes(t));
        });
        if (confirmCandidates.length > 0) {
          const scored = confirmCandidates.map(m => ({ movie: m, score: scoreMovie(m, affinities) }));
          scored.sort((a, b) => b.score - a.score);
          return scored[0].movie;
        }
      }
    }
    // No conviction-locked niche yet → fall through to diversified general scoring
    // so the engine keeps firing a WIDE variety until a real signal emerges.
  }

  // ── GENERAL SCORING FALLBACK ─────────────────────────────────────────────
  // (Used when phase-specific candidates are exhausted)

  // Identify genres that the user hates (affinity <= -2)
  const hatedGenreIds = Object.entries(affinities)
    .filter(([genre, score]) => genre !== 'General' && score <= -2 && !isNaN(Number(genre)))
    .map(([genre]) => parseInt(genre, 10));

  // Count how many times each micro-genre has been asked in the session
  const askedMicroCounts: Record<string, number> = {};
  flatShuffledDeck.forEach(m => {
    if (asked.has(m.id) && m._microTags) {
      m._microTags.forEach(t => {
        askedMicroCounts[t] = (askedMicroCounts[t] || 0) + 1;
      });
    }
  });

  // Find candidate movies from the shuffled deck
  const candidates = flatShuffledDeck.filter(m => {
    if (asked.has(m.id)) return false;
    // Filter out movies with hated genres (but allow if we're in EXCLUDE phase testing them)
    if (questionIdx < PHASE2_END) {
      const hasHatedGenre = (m._genreIds || []).some(g => hatedGenreIds.includes(g));
      if (hasHatedGenre) return false;
    }
    return true;
  });

  if (candidates.length === 0) {
    return flatShuffledDeck.find(m => !asked.has(m.id)) || null;
  }

  // Score candidates
  const scoredCandidates = candidates.map(m => {
    let score = scoreMovie(m, affinities);

    // Apply micro-genre diversity penalty to encourage exploration
    if (m._microTags && m._microTags.length > 0) {
      m._microTags.forEach(t => {
        const askedCount = askedMicroCounts[t] || 0;
        const affVal = affinities[microKey ? microKey(t) : `micro:${t}`] || 0;

        if (affVal >= 2) {
          if (askedCount >= 10) {
            // We've asked about this micro-genre heavily — avoid spamming it too much
            score -= 100.0;
          }
          return;
        }

        score -= 1.5 * askedCount;
      });
    } else {
      // Penalize untagged movies to encourage specific micro-genre signal gathering
      score -= 2.0;
    }

    return { movie: m, score };
  });

  scoredCandidates.sort((a, b) => b.score - a.score);
  return scoredCandidates[0].movie;
}
