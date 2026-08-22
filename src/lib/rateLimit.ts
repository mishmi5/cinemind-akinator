// Rate limiting across every instance, not inside one of them.
//
// This was a per-process Map, which on serverless is decorative rather than wrong-by-a-little: with
// N warm instances the real ceiling is N × limit, and a cold start resets a caller's counter to
// zero. Nothing reports it, so the limiter looks healthy right up until someone walks through it —
// and the thing they walk into is TMDB, whose quota is shared by every real visitor.
//
// The shared counter lives in Firestore. Two things keep it from becoming a tax on every request:
//
//   1. A LOCAL PRE-CHECK. This instance's own memory already knows about the callers it has served,
//      so an abuser hammering one instance is refused with no database round-trip at all. The local
//      counter can only ever be an UNDER-count of the true total, so a local refusal is always
//      correct — it can never reject someone the shared counter would have allowed.
//   2. FAIL OPEN. If Firestore is slow, missing or erroring, the request is allowed and the local
//      counter still applies. A limiter that takes the product down when the database hiccups has
//      done more damage than the abuse it was guarding against.
import { firestoreOrNull, shoutOnce } from '@/lib/firestoreAdmin';
import { FieldValue } from 'firebase-admin/firestore';

const COLLECTION = 'rateLimits';
const rateLimitCache = new Map<string, { count: number; expiresAt: number }>();

// DISABLE_RATE_LIMIT exists so a local attack suite can hammer the engine without cutting itself
// off. It is deliberately NOT honoured in production: the variable lives in .env.local, one stray
// copy of that file into the host's environment would turn every limiter in the app off, and
// nothing would report it — the app would look healthy right up until someone flooded it. A switch
// whose failure mode is silent and total does not get to work in production.
const RATE_LIMIT_DISABLED =
  process.env.NODE_ENV !== 'production' &&
  (process.env.DISABLE_RATE_LIMIT === 'true' || process.env.NODE_ENV === 'development');

if (process.env.NODE_ENV === 'production' && process.env.DISABLE_RATE_LIMIT === 'true') {
  console.warn('[rateLimit] DISABLE_RATE_LIMIT is set in production and is being ignored. Remove it from the host environment.');
}

/** Bounded so a flood of distinct keys cannot exhaust this instance's memory. */
const MAX_LOCAL_KEYS = 20_000;

function bumpLocal(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const record = rateLimitCache.get(key);
  if (!record || record.expiresAt < now) {
    if (rateLimitCache.size > MAX_LOCAL_KEYS) {
      for (const [k, v] of rateLimitCache) if (v.expiresAt < now) rateLimitCache.delete(k);
      if (rateLimitCache.size > MAX_LOCAL_KEYS) rateLimitCache.clear();
    }
    rateLimitCache.set(key, { count: 1, expiresAt: now + windowMs });
    return true;
  }
  if (record.count >= limit) return false;
  record.count += 1;
  return true;
}

export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  if (RATE_LIMIT_DISABLED) return true;

  // Local first: free, and a refusal here is always right.
  if (!bumpLocal(key, limit, windowMs)) return false;

  const db = await firestoreOrNull();
  if (!db) return true;   // no shared counter available — the local one is all there is

  // The window is a fixed bucket derived from the clock, so every instance agrees on which window a
  // request belongs to without any coordination, and an expired bucket is simply never read again.
  const bucket = Math.floor(Date.now() / windowMs);
  const ref = db.collection(COLLECTION).doc(`${encodeURIComponent(key)}_${windowMs}_${bucket}`);
  try {
    const after = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const count = (snap.exists ? (snap.data()?.count as number) : 0) || 0;
      if (count >= limit) return count + 1;   // already over — do not grow the document further
      tx.set(ref, {
        count: FieldValue.increment(1),
        // Stamped so a Firestore TTL policy on this field can collect the buckets. Without one they
        // accumulate; that is a cleanup job, not a correctness problem.
        expiresAt: new Date(Date.now() + windowMs * 2),
      }, { merge: true });
      return count + 1;
    });
    return after <= limit;
  } catch (e) {
    shoutOnce('rate limit counter unavailable — allowing the request on the local counter alone', e);
    return true;
  }
}
