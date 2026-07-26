import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { sendTelegramAlert } from '@/lib/telegram';

export async function POST(req: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    console.error(
      '[Stripe Webhook] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET environment variables'
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
        await sendTelegramAlert(
          `🎉 <b>New Premium Subscription!</b>\nAmount: ${amount} ${currency}\nCustomer: ${session.customer_details?.email || 'Unknown'}`
        );
        break;
      }

      case 'checkout.session.expired': {
        const abandonedSession = event.data.object as Stripe.Checkout.Session;
        // Trigger Abandoned Cart Flow
        await sendTelegramAlert(
          `🛒 <b>Abandoned Cart Detected</b>\nA customer reached the checkout page but didn't finish.\nEmail: ${abandonedSession.customer_details?.email || 'Not provided'}`
        );
        // TODO: Integrate Resend to send "Hey, you left your Premium upgrade!"
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
