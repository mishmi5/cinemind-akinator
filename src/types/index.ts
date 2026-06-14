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
  /** Accumulated Fisher information of the taste estimate; SE=1/√(1+infoSum). */
  infoSum?: number;
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
}