import type { Timestamp } from 'firebase/firestore';

/**
 * CineMind FOMO Backbone — Firestore data model.
 * Gap A (Identity)→UserDoc · Gap B (Taste)→TasteVector · Gap C (Economy)→
 * EconomyState(cache)+LedgerEvent(truth) · Gap D (Realtime)→Duel+LiveEvent.
 *
 * SECURITY INVARIANT: economy / taste / streak / premium are SERVER-AUTHORED
 * only (Admin SDK via Next.js API routes). Client writes profile fields only.
 */

export const COLLECTIONS = {
  users: 'users',
  ledger: 'ledger',        // users/{uid}/ledger/{eventId}
  duels: 'duels',
  liveEvents: 'liveEvents',
  claims: 'claims',        // liveEvents/{eventId}/claims/{uid}
  cards: 'cards',
  sessions: 'sessions',    // pre-existing quiz sessions
} as const;

/* ── Gap B — Taste Vector (1:1 mirror of engine SessionState.userAffinities) ── */
export interface TasteVector {
  affinities: Record<string, number>;   // genre/tag -> signed weight (== userAffinities)
  leadingMicroGenres: string[];          // == VectorState.leadingMicroGenres
  confidenceScore: number;               // 0..1, == engine confidenceScore
  // derived for Roast Card (F1) + Duel comparison (F3):
  archetype: string | null;              // "The Pretentious Cinephile"
  roastText: string | null;
  topGenres: string[];
  contrarianScore: number;               // 0..1 distance from mainstream
  totalAnswers: number;
  version: number;                       // migration guard
  updatedAt: Timestamp;
}

/* ── Gap C — Economy cache (truth = ledger) ── */
export interface EconomyState {
  popcornTokens: number;                 // spendable (F4 paywall bypass)
  xp: number;
  level: number;
  xpMultiplier: number;                  // streak-driven, e.g. 1.0 / 1.5 / 2.0 (F2)
  lifetimeTokensEarned: number;
  lifetimeTokensSpent: number;
}

/* ── Feature 2 — streak / daily pulse / XP decay ── */
export interface StreakState {
  current: number;
  longest: number;
  lastPulseDate: string | null;          // 'YYYY-MM-DD' UTC — idempotent daily gate
  multiplierExpiresAt: Timestamp | null; // now > this ⇒ multiplier decays
  pulseCompletedToday: boolean;
}

/* ── Gap A — User Model ── */
export interface UserDoc {
  uid: string;
  handle: string;                        // unique, URL-safe; duel/share links
  displayName: string;
  photoURL: string | null;
  isAnonymous: boolean;
  tasteVector: TasteVector;              // Gap B
  economy: EconomyState;                 // Gap C cache
  streak: StreakState;                   // F2
  isPremium: boolean;                    // F4
  premiumSince: Timestamp | null;
  createdAt: Timestamp;
  lastActiveAt: Timestamp;
}

/** Fields the CLIENT may write on its own user doc — keep in lockstep w/ rules */
export type UserClientWritableField =
  | 'displayName' | 'photoURL' | 'handle' | 'lastActiveAt';

/* ── Gap C — Event Ledger (append-only, server-written, source of truth) ── */
export type LedgerEventType =
  | 'QUIZ_COMPLETED'        // F1
  | 'ANSWER_ACCURATE'       // F4 — accurate answer grants tokens
  | 'DAILY_PULSE'           // F2
  | 'STREAK_BONUS'          // F2
  | 'XP_DECAY'              // F2 penalty
  | 'TOKENS_SPENT_PAYWALL'  // F4
  | 'DUEL_WON' | 'DUEL_LOST'// F3
  | 'ROULETTE_WIN'          // F5
  | 'ADMIN_ADJUST';

export interface LedgerEvent {
  id: string;
  type: LedgerEventType;
  xpDelta: number;                       // signed
  tokenDelta: number;                    // signed
  xpBalance: number;                     // balance AFTER apply (audit/replay)
  tokenBalance: number;
  idempotencyKey: string;                // 'pulse:2026-06-03' | 'duel:{id}:payout' ...
  refId: string | null;                  // duelId / liveEventId / sessionId
  source: 'server' | 'function' | 'admin';
  createdAt: Timestamp;
}

/* ── Feature 1 — shareable Roast Card (public read; no user-doc exposure) ── */
export interface ShareCard {
  id: string;
  ownerUid: string;
  handle: string;
  archetype: string;
  roastText: string;
  topGenres: string[];
  contrarianScore: number;
  confidenceScore: number;
  posterCollage: string[];
  ogImageUrl: string | null;             // pre-rendered OG image (server)
  createdAt: Timestamp;
}

/* ── Feature 3 — The Taste Duel (realtime: onSnapshot(duels/{id})) ── */
export type DuelStatus = 'PENDING' | 'ACTIVE' | 'COMPLETE' | 'EXPIRED';

export interface DuelPlayer {
  uid: string;
  handle: string;
  photoURL: string | null;
  tasteSnapshot: TasteVector | null;     // frozen at join → reproducible verdict
  score: number;
  ready: boolean;
}

export interface DuelComparison {
  similarity: number;                    // 0..1 cosine of affinity vectors
  challengerEdge: string[];
  opponentEdge: string[];
  verdict: string;                       // roast-style "who has better taste"
}

export interface Duel {
  id: string;
  status: DuelStatus;
  challenger: DuelPlayer;
  opponent: DuelPlayer | null;           // null until friend joins via link
  inviteCode: string;
  questionSet: string[];                 // shared movie ids for fairness
  winnerUid: string | null;              // server-authored
  comparison: DuelComparison | null;     // server-authored
  participantUids: string[];             // [challenger, opponent?] — rules + queries
  createdAt: Timestamp;
  expiresAt: Timestamp;                  // FOMO TTL
  updatedAt: Timestamp;
}

/* ── Feature 5 — Midnight Roulette (realtime: onSnapshot(liveEvents/{id})) ── */
export type LiveEventType = 'MIDNIGHT_ROULETTE';
export type LiveEventStatus = 'SCHEDULED' | 'OPEN' | 'CLOSED';

export interface LiveEvent {
  id: string;                            // 'roulette-2026-06-03'
  type: LiveEventType;
  status: LiveEventStatus;
  opensAt: Timestamp;                    // 00:00
  closesAt: Timestamp;
  capacity: number;                      // 100
  claimedCount: number;                  // atomic increment → "98/100 claimed!" ticker
  winnerMovieId: string | null;
  createdAt: Timestamp;
}

/** liveEvents/{eventId}/claims/{uid} — SERVER-WRITTEN so rank/isWinner can't be forged */
export interface RouletteClaim {
  uid: string;
  handle: string;
  rank: number;                          // 1-based order, server-assigned
  isWinner: boolean;                     // rank <= capacity
  grantedMovieId: string | null;
  claimedAt: Timestamp;
}
