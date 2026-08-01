import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe';
import { grantFounderSeat } from '@/lib/founderSeat';
import { sendTelegramAlert } from '@/lib/telegram';

/**
 * RECONCILIATION — the path that closes the "paid but never granted" hole.
 *
 * The webhook is the primary grant, but it can simply not arrive: a cold start, an expired retry
 * chain, a deploy in the wrong second. Until now `success_url` was `/scan?success=true` — a
 * cosmetic string nobody verified — so a customer could pay ₪99 and nothing in the system knew.
 *
 * Stripe substitutes {CHECKOUT_SESSION_ID} into the success_url, the success page posts it here,
 * and we ask Stripe itself whether the money arrived. `grantFounderSeat` is the SAME idempotent
 * write the webhook uses, so whichever path runs first wins and the second is a no-op.
 */
export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) {
    // TODO(owner): STRIPE_SECRET_KEY must be set in production, or nothing here can reconcile.
    console.error('[checkout/verify] STRIPE_SECRET_KEY is not set — cannot verify payments');
    return NextResponse.json({ error: 'Payments are not configured' }, { status: 503 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let uid: string;
  try {
    ({ uid } = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]));
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let sessionId: string;
  try {
    const body = await req.json();
    sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  } catch {
    sessionId = '';
  }
  // cs_test_* / cs_live_* — reject junk before spending a Stripe call on it.
  if (!sessionId.startsWith('cs_')) {
    return NextResponse.json({ error: 'Missing or malformed sessionId' }, { status: 400 });
  }

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    console.error('[checkout/verify] session retrieve failed', sessionId, err);
    return NextResponse.json({ error: 'Unknown session' }, { status: 404 });
  }

  // Whose session is it. If Stripe carries a uid it must match the caller — otherwise anyone who
  // learns a session id could claim someone else's purchase. A session with NO uid (checkout
  // started before sign-in) is bound to the caller, who could only have the id from success_url.
  const owner = session.client_reference_id || (session.metadata?.uid as string | undefined);
  if (owner && owner !== uid) {
    console.warn('[checkout/verify] uid mismatch', { sessionId, owner, caller: uid });
    return NextResponse.json({ error: 'This purchase belongs to another account' }, { status: 403 });
  }

  if (session.payment_status !== 'paid') {
    return NextResponse.json({ status: 'unpaid', paymentStatus: session.payment_status }, { status: 200 });
  }

  const { outcome } = await grantFounderSeat(session, 'verify', uid);

  if (outcome === 'granted') {
    // Loud on purpose: every grant that lands here is a webhook that did not do its job.
    console.warn('[checkout/verify] granted by reconciliation — webhook did not arrive', sessionId);
    await sendTelegramAlert(
      `🩹 <b>Seat granted by reconciliation</b>\nSession: ${session.id}\nUID: ${uid}\nThe webhook never granted this one — check STRIPE_WEBHOOK_SECRET and the endpoint.`
    );
  }

  return NextResponse.json({
    status: outcome,                       // granted | already-granted | refunded | no-uid
    isPremium: outcome !== 'refunded',
    amountTotal: session.amount_total,
    currency: session.currency,
    email: session.customer_details?.email ?? null,
  });
}
