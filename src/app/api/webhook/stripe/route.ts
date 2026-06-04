import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2026-05-27.dahlia',
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_placeholder';

export async function POST(req: Request) {
  const payload = await req.text();
  const sig = req.headers.get('stripe-signature') as string;

  let event;

  try {
    event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
  } catch (err: any) {
    console.error(`[Stripe Webhook Error]`, err.message);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  // Handle the event
  switch (event.type) {
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerEmail = invoice.customer_email;
      const amountDue = invoice.amount_due / 100;
      
      console.log(`[Dunning Automation] Payment failed for ${customerEmail}. Amount due: ${amountDue}₪`);
      
      // Here we would integrate with our Email/SMS provider (Resend or Twilio)
      // to send a "Card Failed" recovery email.
      // e.g., await resend.emails.send({ ... });
      
      // If it's the 3rd failed attempt, we would suspend the user in Firebase.
      
      break;
    }
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log(`[Checkout Completed] Session ID: ${session.id} for ${session.customer_email}`);
      // Here we would provision the subscription / credits in Firebase.
      break;
    }
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  return NextResponse.json({ received: true });
}
