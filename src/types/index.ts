export type AnswerType = 1 | 2 | 3 | 4 | 5 | 'NOT_SEEN';

export type EasterEggType = 'oscar' | 'blood' | 'wazzap' | 'matrix';

export interface EasterEgg {
  type: EasterEggType;
  soundUrl?: string;
}

export interface MovieContext {
  id: string;
  title: string;
  originalDetails: string;
  rating: number;
  posterUrl: string;
  overview: string;
  trailerId: string;
  easterEgg?: EasterEgg;
  /** TMDB genre IDs used internally by the recommendation engine */
  _genreIds?: number[];
  /** Curated sub-genre niches (from TMDB keywords) — the individuality layer */
  _niches?: string[];
  /** Micro-genre tags from the formula engine's own tagger (text + genre-id matching) */
  _microTags?: string[];
}

export interface Question {
  id: string;
  text: string;
  movie?: MovieContext;
}

export interface VectorState {
  possibleMoviesRemaining: number;
  leadingMicroGenres: string[];
}

export interface RecommendedMovie {
  id: string;
  title: string;
  matchScore: number;
  posterUrl: string;
  trailerId: string;
  overview: string;
}

export interface SessionState {
  sessionId: string;
  isComplete: boolean;
  confidenceScore: number;
  currentQuestion: Question | null;
  currentVectorState: VectorState;
  finalMovies?: RecommendedMovie[];
  historyCount: number;
  /** Honest display progress (0-100): climbs smoothly, hits 100 only at completion */
  progressPercent?: number;
  askedMovieIds: string[];
  /** Accumulated user taste affinities per genre/tag */
  userAffinities: Record<string, number>;
  /** Per-genre exposure tally: n=times served, s=times skipped (NOT_SEEN). Drives
   *  the Beta-Binomial serving weight w_g=(n−s+2)/(n+3) — see TASTE-FORMULA.md §8. */
  genreStats?: Record<string, { n: number; s: number }>;
  /** Count of REAL 1–5★ ratings only (NOT_SEEN never counts) — the completion clock. */
  ratedCount?: number;
  /** True once stopping now would still produce a recommendation worth having. Lets the quiz
   *  offer the exit in words to a tiring user instead of leaving "close the tab" as the only
   *  obvious way out. */
  readyToFinish?: boolean;
  /** Accumulated Fisher information of the taste estimate; SE=1/√(1+infoSum). */
  infoSum?: number;
  /** v12 raw per-genre observations {n,sum,sq} — basis for consistency confidence. */
  genreObs?: Record<string, { n: number; sum: number; sq: number }>;
  /** v12 raw per-niche (sub-genre) observations {n,sum,sq}. */
  nicheObs?: Record<string, { n: number; sum: number; sq: number }>;
  /** Brain engine: accumulated rating history [{title,year,genres,rating}] (round-tripped in body). */
  ratingHistory?: { title: string; year?: string; genres: string[]; rating: number }[];
  /** Brain engine: the model's natural-language taste summary. */
  tasteSummary?: string;
}

export interface AnswerPayload {
  sessionId?: string;
  movieId?: string;
  answer?: number | 'SKIP';
  isInit?: boolean;
  genreIds?: number[];
  /** Titles already shown this session — blocks same-title repeats (remakes, re-releases) */
  askedTitles?: string[];
  /** Niches of the answered movie — feeds the sub-genre taste layer */
  niches?: string[];
  /** formula engine contract */
  microTags?: string[];
  /** formula engine contract */
  currentConfidence?: number;
  /** formula engine contract */
  historyCount?: number;
  /** formula engine contract */
  askedMovieIds?: string[];
  /** formula engine contract */
  userAffinities?: Record<string, number>;
  /** formula engine contract */
  seenMovieIds?: string[];
  /** formula engine contract */
  locale?: string;
  /** formula engine contract */
  seed?: number;
  /** formula engine contract */
  questionId?: string;
}