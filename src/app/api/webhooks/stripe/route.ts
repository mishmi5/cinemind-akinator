import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { sendTelegramAlert } from '@/lib/telegram';
import { adminDb } from '@/lib/firebase-admin';
import {
  grantFounderSeat,
  revokeFounderSeat,
  PURCHASES_COLLECTION,
  type PurchaseClaim,
} from '@/lib/founderSeat';

export async function POST(req: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // FAIL CLOSED. Without the signing secret we cannot tell a real Stripe event from a forged one,
  // so we process nothing. 500 (not 200) is deliberate: Stripe keeps retrying for ~3 days, so once
  // the secret is set the queued grants land on their own instead of being lost.
  // TODO(owner): set STRIPE_WEBHOOK_SECRET (whsec_…) in the production environment — Stripe
  // Dashboard → Developers → Webhooks → your endpoint → "Signing secret". It is absent from
  // .env.local, so locally this route grants nothing; the /purchase reconciliation is the net.
  if (!secretKey || !webhookSecret) {
    console.error(
      '[Stripe Webhook] NOT CONFIGURED — refusing every event.' +
        ` STRIPE_SECRET_KEY=${secretKey ? 'set' : 'MISSING'}` +
        ` STRIPE_WEBHOOK_SECRET=${webhookSecret ? 'set' : 'MISSING'}.` +
        ' Payments will be taken and no seat will be granted until this is fixed.'
    );
    return NextResponse.json(
      { error: 'Stripe webhook is not configured' },
      { status: 500 }
    );
  }

  const stripe = new Stripe(secretKey);

  const payload = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  // Verify the signature BEFORE doing anything with the payload.
  // Failures here are silent (no Telegram alert) so a flood of forged
  // requests can't be used to spam our alert channel.
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Stripe Webhook] Signature verification failed:', message);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const amount = ((session.amount_total ?? 0) / 100).toFixed(2);
        const currency = (session.currency ?? '').toUpperCase();
        // GRANT WHAT THEY PAID FOR. This handler only sent a Telegram message: nothing in the
        // codebase ever set isPremium, so a founder paid ₪99 and received exactly what a free
        // visitor already had. The uid rides on the session as client_reference_id.
        // The grant itself lives in src/lib/founderSeat.ts, shared with /api/checkout/verify, so
        // a webhook and a success-page reconciliation racing each other grant exactly one seat.
        const uid = session.client_reference_id || (session.metadata?.uid as string | undefined);
        if (uid && session.payment_status === 'paid') {
          try {
            await grantFounderSeat(session, 'webhook');
          } catch (err) {
            console.error('[Stripe Webhook] failed to grant founder access for', uid, err);
            // 500 makes Stripe retry, which is exactly what we want when the grant failed.
            return NextResponse.json({ error: 'grant failed' }, { status: 500 });
          }
        } else {
          await sendTelegramAlert(`⚠️ <b>Paid session with no uid</b>
Session: ${session.id}
Email: ${session.customer_details?.email || 'unknown'} — grant manually.`);
        }
        await sendTelegramAlert(
          `🎉 <b>New Premium Subscription!</b>\nAmount: ${amount} ${currency}\nCustomer: ${session.customer_details?.email || 'Unknown'}`
        );
        break;
      }

      case 'charge.refunded': {
        // A refund issued from the Stripe Dashboard (not our /api/refund route) must take the seat
        // back too — otherwise the money goes home and the entitlement stays.
        const charge = event.data.object as Stripe.Charge;
        const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
        if (pi) {
          const snap = await adminDb
            .collection(PURCHASES_COLLECTION)
            .where('paymentIntentId', '==', pi)
            .limit(1)
            .get();
          const claim = snap.docs[0]?.data() as PurchaseClaim | undefined;
          if (claim && !claim.refundedAt) {
            await revokeFounderSeat(claim.sessionId, charge.refunds?.data[0]?.id ?? 'dashboard', 'stripe-dashboard');
            await sendTelegramAlert(`↩️ <b>Refund via Stripe Dashboard</b>\nUID: ${claim.uid}\nSeat revoked.`);
          }
        }
        break;
      }

      case 'checkout.session.expired': {
        const abandonedSession = event.data.object as Stripe.Checkout.Session;
        // Trigger Abandoned Cart Flow
        await sendTelegramAlert(
          `🛒 <b>Abandoned Cart Detected</b>\nA customer reached the checkout page but didn't finish.\nEmail: ${abandonedSession.customer_details?.email || 'Not provided'}`
        );
        // No "you left your upgrade" email is sent here, and that is a decision rather than a gap.
        // Someone who reached the checkout and walked away has given us an address for a purchase
        // they did not make — not consent to be marketed to. Under the Communications Law an
        // unsolicited commercial message of that kind needs prior consent, must be labelled
        // "פרסומת", and carries a statutory penalty per message. The Telegram alert above tells
        // the owner it happened, which is the part that needs no permission.
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        // Trigger Dunning Flow
        await sendTelegramAlert(
          `💳 <b>Payment Failed (Dunning)</b>\nInvoice failed for ${invoice.customer_email}.\nAmount: ${((invoice.amount_due ?? 0) / 100).toFixed(2)}`
        );
        break;
      }

      case 'customer.subscription.deleted':
        await sendTelegramAlert(
          `😢 <b>Subscription Cancelled</b>\nCustomer cancelled their Elite plan.`
        );
        break;

      default:
        console.log(`[Stripe Webhook] Unhandled event type ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook] Handler error:', error);
    await sendTelegramAlert(`🚨 <b>Stripe Webhook Error</b>\n` + String(error));
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 400 });
  }
}
