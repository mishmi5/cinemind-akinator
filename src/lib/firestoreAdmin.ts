// A Firestore handle that is allowed to be absent — and that says so when it is.
//
// `firebase-admin.ts` builds its handle at import time, which is right for the routes that cannot
// work without it: a duel or a purchase has no meaning with no database. The session store and the
// rate limiter are different. They sit on the hot path of every quiz request, and a missing service
// account (a local checkout, a preview deploy, a rotated key) must degrade them rather than take
// the product down with it.
//
// TWO THINGS HERE WERE LEARNED THE HARD WAY, IN THIS FILE, WITHIN AN HOUR OF WRITING IT.
//
// The first draft used `require('./firebase-admin')` to stay lazy. Under the Next bundler that call
// SUCCEEDS and hands back a namespace whose `adminDb` is undefined — no throw, nothing to catch. So
// it is `await import()` now, which the bundler tracks properly, with a `.default` unwrap for the
// interop shape.
//
// The second draft then treated that undefined as a quiet `null` and logged nothing, so the store
// fell back to per-instance memory and the log stayed clean. That is precisely the failure this
// codebase keeps meeting — the cron that reports success while writing nothing, the quiz that
// announced "we cracked you" over zero films. An absent handle is now shouted once, whichever way
// it goes absent, because a silent fallback to broken behaviour is worse than no fallback at all.
import type { Firestore } from 'firebase-admin/firestore';

let pending: Promise<Firestore | null> | undefined;
let warned = false;

function goneQuiet(why: string, e?: unknown) {
  if (warned) return;
  warned = true;
  console.error(
    `[firestore] admin handle unavailable (${why}) — the session store and rate limiter are ` +
    'falling back to PER-INSTANCE MEMORY, which is not shared between serverless instances. A quiz ' +
    'whose next answer lands on another instance will lose its profile. Set ' +
    'FIREBASE_SERVICE_ACCOUNT_KEY (or application default credentials) in this environment.',
    e ?? '',
  );
}

export function firestoreOrNull(): Promise<Firestore | null> {
  if (pending) return pending;
  pending = (async () => {
    try {
      const mod = await import('./firebase-admin');
      const db = (mod as { adminDb?: Firestore }).adminDb
        ?? (mod as { default?: { adminDb?: Firestore } }).default?.adminDb
        ?? null;
      if (!db) goneQuiet('module loaded but adminDb was undefined');
      return db;
    } catch (e) {
      goneQuiet('module failed to load', e);
      return null;
    }
  })();
  return pending;
}

/** Log a Firestore failure once per process per subject, so a broken database cannot fill the log
 *  with one line per request and bury everything else. */
const shouted = new Set<string>();
export function shoutOnce(subject: string, e: unknown) {
  if (shouted.has(subject)) return;
  shouted.add(subject);
  console.error(`[firestore] ${subject}`, e);
}
