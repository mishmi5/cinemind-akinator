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
// THIS USED TO BE AN IN-PROCESS MAP, AND ON SERVERLESS THAT IS A CORRECTNESS BUG, NOT A SCALING
// ONE. Every Netlify function invocation may be a fresh instance, so a person's second answer can
// land somewhere that has never heard of their session. The old code read that as "no session",
// started a new one, and carried on — the quiz silently rebuilt a partial profile and shipped
// three confident recommendations from a fraction of the answers. A wrong recommendation delivered
// with full confidence is the one failure this product cannot survive, and it needed no load test
// to find: the store simply was not shared.
//
// It is Firestore now, with the Map kept as a per-instance fallback for environments that have no
// service account (a local checkout, a preview deploy, a rotated key). The fallback is the old
// broken behaviour, so it says so loudly once — it must never be mistaken for the working path.
import type { BrainHistoryItem } from './tasteBrain';
import { firestoreOrNull, shoutOnce } from '@/lib/firestoreAdmin';

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
  /** The language the quiz started in. Titles, synopses and question text are all fetched in it and
   *  they live inside the session, so a later request that arrives without an x-locale header must
   *  not be allowed to flip the quiz to the default language halfway through. The client does send
   *  the header on every request; this is here so that one client bug cannot serve a Hebrew film to
   *  an English reader without anything failing. */
  locale?: string;
  touched: number;
}

const TTL_MS = 2 * 60 * 60 * 1000;   // a quiz nobody has touched for two hours is over
const MAX_SESSIONS = 5000;           // bounds the FALLBACK map only; Firestore is not memory
const COLLECTION = 'brainSessions';

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

/** Firestore rejects a document containing `undefined`, and three fields here are optional. A JSON
 *  round-trip drops them and is safe on this shape — it is all plain arrays, numbers and strings. */
function forStorage(s: BrainSession): Record<string, unknown> {
  return JSON.parse(JSON.stringify(s));
}

function fresh(): BrainSession {
  return { history: [], probe: {}, notSeen: 0, skipYears: [], shown: 0, served: [], servedTitles: [], touched: Date.now() };
}

export async function getSession(id: string): Promise<BrainSession | undefined> {
  if (!id) return undefined;
  const db = await firestoreOrNull();
  if (db) {
    try {
      const snap = await db.collection(COLLECTION).doc(id).get();
      if (!snap.exists) return undefined;
      const s = snap.data() as BrainSession;
      // The TTL is enforced on read as well as by the sweep, so an expired quiz is over even if
      // nothing has cleaned it up yet. Firestore's own TTL policy can delete the row later.
      if (!s || typeof s.touched !== 'number' || s.touched < Date.now() - TTL_MS) return undefined;
      return s;
    } catch (e) {
      // A read failure is NOT "no session" — answering that would restart the quiz and rebuild a
      // partial profile, which is the exact bug this file exists to stop. Fall through to whatever
      // this instance happens to hold and let the caller see a real session or none at all.
      shoutOnce('session read failed — falling back to this instance\'s memory', e);
    }
  }
  const s = store.get(id);
  if (!s) return undefined;
  if (s.touched < Date.now() - TTL_MS) { store.delete(id); return undefined; }
  return s;
}

export async function startSession(id: string): Promise<BrainSession> {
  const s = fresh();
  const db = await firestoreOrNull();
  if (db) {
    try {
      await db.collection(COLLECTION).doc(id).set(forStorage(s));
      return s;
    } catch (e) {
      shoutOnce('session create failed — this quiz lives only on one instance', e);
    }
  }
  sweep();
  store.set(id, s);
  return s;
}

export async function saveSession(id: string, s: BrainSession) {
  if (!id) return;
  s.touched = Date.now();
  const db = await firestoreOrNull();
  if (db) {
    try {
      await db.collection(COLLECTION).doc(id).set(forStorage(s));
      return;
    } catch (e) {
      shoutOnce('session write failed — the next answer may not see this one', e);
    }
  }
  store.set(id, s);
}

/** Only a quiz the server actually ran can be paid for. */
export async function isVerified(id: string): Promise<boolean> {
  const s = await getSession(id);
  return !!s && s.served.length > 0;
}
