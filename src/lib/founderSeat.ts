import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/types/firebase';
import type Stripe from 'stripe';

/**
 * The one place a founder seat is granted or revoked.
 *
 * Two paths reach a paid customer: the Stripe webhook (`checkout.session.completed`) and the
 * success page reconciliation (`/api/checkout/verify`). A webhook that never arrives — cold start,
 * expired retry, deploy — used to mean ₪99 taken and nothing granted. Both paths now call this,
 * so a customer whose webhook DID arrive is not granted twice and the two can never drift.
 *
 * IDEMPOTENCY: one document per Checkout Session in `stripePurchases/{session.id}`, created in the
 * same transaction as the user write. Firestore refuses the second create, so the grant happens
 * exactly once no matter how many webhook retries and page reloads race each other. The doc is
 * also the refund ledger: once `refundedAt` is set, re-verifying the same session never re-grants.
 */
export const PURCHASES_COLLECTION = 'stripePurchases';

export type GrantOutcome = 'granted' | 'already-granted' | 'refunded' | 'no-uid';

export interface PurchaseClaim {
  uid: string;
  sessionId: string;
  paymentIntentId: string | null;
  amountTotal: number | null;
  currency: string | null;
  email: string | null;
  paidAt: string;          // ISO — Stripe's session.created, the date the 14 days run from
  grantedAt: string;
  grantedBy: 'webhook' | 'verify';
  refundedAt?: string;
  refundId?: string;
  refundedBy?: string;
}

function sessionUid(session: Stripe.Checkout.Session): string | null {
  return session.client_reference_id || (session.metadata?.uid as string | undefined) || null;
}

export function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  return typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id ?? null;
}

/**
 * Grant the seat this paid session bought. Safe to call any number of times for the same session.
 * `fallbackUid` is used only when the session carries no uid at all (an older session, or a
 * checkout started before sign-in) — the caller must have proven it owns the session first.
 */
export async function grantFounderSeat(
  session: Stripe.Checkout.Session,
  grantedBy: 'webhook' | 'verify',
  fallbackUid?: string
): Promise<{ outcome: GrantOutcome; uid: string | null }> {
  const uid = sessionUid(session) || fallbackUid || null;
  if (!uid) return { outcome: 'no-uid', uid: null };

  const claimRef = adminDb.collection(PURCHASES_COLLECTION).doc(session.id);
  const userRef = adminDb.collection(COLLECTIONS.users).doc(uid);
  const paidAt = new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();

  // ponytail: the 200-seat cap is enforced at checkout, not here. A paid customer is granted even
  // if a race pushed us to 201 — refusing money we already took is the worse bug. If that matters,
  // count inside this transaction and alert instead of refusing.
  const outcome = await adminDb.runTransaction<GrantOutcome>(async (tx) => {
    const claim = await tx.get(claimRef);
    if (claim.exists) {
      return (claim.data() as PurchaseClaim).refundedAt ? 'refunded' : 'already-granted';
    }
    // Both reads have to happen before the first write — Firestore refuses a read after a write
    // inside a transaction.
    const existingEmail = (await tx.get(userRef)).data()?.email as string | undefined;
    const email = session.customer_details?.email ?? null;
    const record: PurchaseClaim = {
      uid,
      sessionId: session.id,
      paymentIntentId: paymentIntentId(session),
      amountTotal: session.amount_total ?? null,
      currency: session.currency ?? null,
      email,
      paidAt,
      grantedAt: new Date().toISOString(),
      grantedBy,
    };
    tx.set(claimRef, record);
    tx.set(
      userRef,
      {
        isPremium: true,
        plan: 'founder',
        premiumSince: record.grantedAt,
        stripeSessionId: session.id,
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
        // The weekly recommendations mail — the headline reason to pay — reads `email` off this
        // document, and nothing was ever writing it for a customer who paid without an account
        // email. Stripe does not guarantee an email on the session, and an address the user gave us
        // at signup is the one they know, so Stripe's fills the gap and never overwrites.
        ...(email && !existingEmail ? { email } : {}),
      },
      { merge: true }
    );
    return 'granted';
  });

  return { outcome, uid };
}

/**
 * Mark the purchase refunded and take the seat back. The claim doc is kept (never deleted) so a
 * refunded customer who reloads the success page is not silently re-granted.
 * Setting isPremium:false is also what frees the seat — checkout counts isPremium == true.
 */
export async function revokeFounderSeat(sessionId: string, refundId: string, actorUid: string) {
  const claimRef = adminDb.collection(PURCHASES_COLLECTION).doc(sessionId);
  await adminDb.runTransaction(async (tx) => {
    const claim = await tx.get(claimRef);
    if (!claim.exists) throw new Error(`purchase ${sessionId} not found`);
    const data = claim.data() as PurchaseClaim;
    tx.set(
      claimRef,
      { refundedAt: new Date().toISOString(), refundId, refundedBy: actorUid },
      { merge: true }
    );
    tx.set(
      adminDb.collection(COLLECTIONS.users).doc(data.uid),
      { isPremium: false, plan: null, premiumRevokedAt: new Date().toISOString() },
      { merge: true }
    );
  });
}
