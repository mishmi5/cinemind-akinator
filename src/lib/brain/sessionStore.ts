// SERVER-SIDE QUIZ STATE.
//
// The quiz was fully stateless: the browser round-tripped ratingHistory, probeScores and the
// shown meter, and the server signed whatever came back as a proofToken. An adversarial pass
// showed the consequence — one request with an invented ratingHistory returned a valid signed
// token, and /api/user/bootstrap credits XP and Popcorn Tokens per token, keyed on a sessionId
// the client also chooses. Three requests, three grants, no quiz.
//
// The engine stays stateless for CONTINUITY (a cold start or a redeploy must not lose a quiz in
// progress), but it no longer takes the client's word for the things that mint value. What the
// server itself observed lives here, and only a session the server actually served questions to
// can earn a proofToken.
//
// This is deliberately an in-process Map: it matches the existing rateLimit module, needs no
// infrastructure, and closes the economic hole today. A multi-instance deployment needs a shared
// store (Firestore/Redis) — the interface below is the seam for that.
import type { BrainHistoryItem } from './tasteBrain';

export interface BrainSession {
  /** Answers the server itself recorded, in order. */
  history: BrainHistoryItem[];
  /** Probe scores computed by the server, never by the client. */
  probe: Record<string, { sum: number; n: number; hi: number; hi5?: number; lo: number; contra?: number }>;
  /** "Didn't see" answers the server counted. */
  notSeen: number;
  /** Release years of skipped films — steers the sweep toward the user's era. */
  skipYears: number[];
  /** The displayed meter, so a client cannot claim it is at 99. */
  shown: number;
  /** Movie ids the server has actually asked about. An answer for anything else is not an answer. */
  served: string[];
  /** Normalised titles already put on screen. Ids are not enough: a remake carries a different
   *  TMDB id and the same Hebrew name, so the same card came round twice in one quiz. */
  servedTitles: string[];
  /** The id of the question currently on screen. */
  pending?: string;
  touched: number;
}

const TTL_MS = 2 * 60 * 60 * 1000;   // a quiz nobody has touched for two hours is over
const MAX_SESSIONS = 5000;           // bounded so a flood of ids cannot exhaust memory

const store = new Map<string, BrainSession>();

function sweep() {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, s] of store) if (s.touched < cutoff) store.delete(id);
  if (store.size > MAX_SESSIONS) {
    // Oldest first — a session under active use is touched on every answer.
    const byAge = [...store.entries()].sort((a, b) => a[1].touched - b[1].touched);
    for (const [id] of byAge.slice(0, store.size - MAX_SESSIONS)) store.delete(id);
  }
}

export function getSession(id: string): BrainSession | undefined {
  if (!id) return undefined;
  const s = store.get(id);
  if (!s) return undefined;
  if (s.touched < Date.now() - TTL_MS) { store.delete(id); return undefined; }
  return s;
}

export function startSession(id: string): BrainSession {
  sweep();
  const s: BrainSession = { history: [], probe: {}, notSeen: 0, skipYears: [], shown: 0, served: [], servedTitles: [], touched: Date.now() };
  store.set(id, s);
  return s;
}

export function saveSession(id: string, s: BrainSession) {
  if (!id) return;
  s.touched = Date.now();
  store.set(id, s);
}

/** Only a quiz the server actually ran can be paid for. */
export function isVerified(id: string): boolean {
  const s = getSession(id);
  return !!s && s.served.length > 0;
}
