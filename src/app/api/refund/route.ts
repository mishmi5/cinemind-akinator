import { NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe';
import { PURCHASES_COLLECTION, PurchaseClaim, revokeFounderSeat } from '@/lib/founderSeat';
import { sendTelegramAlert } from '@/lib/telegram';

/**
 * REFUND — /terms promises a 14-day cancellation right under חוק הגנת הצרכן. Until now there was
 * no endpoint, no UI and no `stripe.refunds.create` anywhere in the repo: a promise the code could
 * not keep. This is the smallest honest version of that promise.
 *
 * WHO CAN CALL IT
 *  - The buyer, for their own purchase, within 14 days of the payment. That is exactly the right
 *    the terms grant, so it needs no human in the loop.
 *  - An admin (uid listed in ADMIN_UIDS), for anyone, with no time limit — the extended
 *    4-month window for עולה חדש / אזרח ותיק / אדם עם מוגבלות needs a document check, which is a
 *    human decision, not an API call.
 * There is deliberately NO refund button in the UI: /terms tells the customer to email support,
 * and support runs this route. The capability exists; the self-serve surface is the owner's call.
 *
 * ponytail: refunds the full ₪99. §4 of the terms ALLOWS deducting 5% (₪4.95), it does not
 * require it — full refund is one less number to get wrong, and it is what the customer expects.
 */
const REFUND_WINDOW_DAYS = 14;

function isAdmin(uid: string): boolean {
  // TODO(owner): set ADMIN_UIDS in production (comma-separated Firebase uids) or no one can
  // refund outside the customer's own 14-day window.
  const list = (process.env.ADMIN_UIDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.includes(uid);
}

export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) {
    console.error('[refund] STRIPE_SECRET_KEY is not set — cannot issue refunds');
    return NextResponse.json({ error: 'Payments are not configured' }, { status: 503 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let callerUid: string;
  try {
    ({ uid: callerUid } = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]));
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { sessionId?: string; uid?: string } = {};
  try {
    body = await req.json();
  } catch { /* an empty body means "refund my own latest purchase" */ }

  const targetUid = body.uid || callerUid;
  const admin = isAdmin(callerUid);
  if (targetUid !== callerUid && !admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Find the purchase. Explicit sessionId wins; otherwise the target's most recent un-refunded one.
  let claim: PurchaseClaim | undefined;
  if (body.sessionId) {
    const snap = await adminDb.collection(PURCHASES_COLLECTION).doc(body.sessionId).get();
    if (snap.exists) claim = snap.data() as PurchaseClaim;
    if (claim && claim.uid !== targetUid && !admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else {
    const snap = await adminDb
      .collection(PURCHASES_COLLECTION)
      .where('uid', '==', targetUid)
      .get();
    claim = snap.docs
      .map((d) => d.data() as PurchaseClaim)
      .filter((c) => !c.refundedAt)
      .sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0];
  }

  if (!claim) {
    return NextResponse.json({ error: 'No purchase found for this account' }, { status: 404 });
  }
  if (claim.refundedAt) {
    return NextResponse.json({ status: 'already-refunded', refundedAt: claim.refundedAt });
  }
  if (!claim.paymentIntentId) {
    // Nothing to refund against — never guess a payment intent, hand it to a human.
    console.error('[refund] purchase has no payment_intent', claim.sessionId);
    return NextResponse.json({ error: 'Purchase cannot be refunded automatically' }, { status: 409 });
  }

  const ageDays = (Date.now() - Date.parse(claim.paidAt)) / 86_400_000;
  if (ageDays > REFUND_WINDOW_DAYS && !admin) {
    return NextResponse.json(
      { error: 'Refund window has passed', windowDays: REFUND_WINDOW_DAYS, ageDays: Math.floor(ageDays) },
      { status: 403 }
    );
  }

  let refundId: string;
  try {
    const refund = await stripe.refunds.create(
      { payment_intent: claim.paymentIntentId, reason: 'requested_by_customer' },
      // Stripe-side idempotency: a double-click cannot create two refunds for one purchase.
      { idempotencyKey: `refund:${claim.sessionId}` }
    );
    refundId = refund.id;
  } catch (err) {
    console.error('[refund] stripe.refunds.create failed', claim.sessionId, err);
    return NextResponse.json({ error: 'Refund failed at Stripe' }, { status: 502 });
  }

  try {
    // Money first, entitlement second: if this throws, the customer has their ₪99 back and still
    // has access — the recoverable direction. The alert below is how the owner learns of it.
    await revokeFounderSeat(claim.sessionId, refundId, callerUid);
  } catch (err) {
    console.error('[refund] refunded at Stripe but revoke failed', claim.sessionId, err);
    await sendTelegramAlert(
      `🚨 <b>Refund issued, seat NOT revoked</b>\nSession: ${claim.sessionId}\nRefund: ${refundId}\nUID: ${claim.uid}\nRevoke manually.`
    );
    return NextResponse.json({ status: 'refunded', refundId, warning: 'entitlement-not-revoked' });
  }

  await sendTelegramAlert(
    `↩️ <b>Refund</b>\nSession: ${claim.sessionId}\nUID: ${claim.uid}\nBy: ${admin ? `admin ${callerUid}` : 'customer'}\nSeat freed.`
  );
  return NextResponse.json({ status: 'refunded', refundId, sessionId: claim.sessionId });
}
