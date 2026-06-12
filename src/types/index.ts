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
  askedMovieIds: string[];
  /** Accumulated user taste affinities per genre/tag */
  userAffinities: Record<string, number>;
}

export interface AnswerPayload {
  sessionId?: string;
  movieId?: string;
  answer?: number | 'SKIP';
  isInit?: boolean;
  genreIds?: number[];
  /** Titles already shown this session — blocks same-title repeats (remakes, re-releases) */
  askedTitles?: string[];
}