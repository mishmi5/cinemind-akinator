import { NextResponse } from 'next/server';
import { sendTelegramAlert } from '@/lib/telegram';

// Define Stripe event types manually to avoid importing the whole SDK if not installed
interface StripeEvent {
  type: string;
  data: {
    object: any;
  };
}

export async function POST(req: Request) {
  try {
    const payload = await req.text();
    // Verify Stripe signature here in production using stripe.webhooks.constructEvent
    
    const event: StripeEvent = JSON.parse(payload);
    
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        await sendTelegramAlert(`🎉 <b>New Premium Subscription!</b>\nAmount: ${(session.amount_total / 100).toFixed(2)} ${session.currency.toUpperCase()}\nCustomer: ${session.customer_details?.email || 'Unknown'}`);
        break;
        
      case 'checkout.session.expired':
        const abandonedSession = event.data.object;
        // Trigger Abandoned Cart Flow
        await sendTelegramAlert(`🛒 <b>Abandoned Cart Detected</b>\nA customer reached the checkout page but didn't finish.\nEmail: ${abandonedSession.customer_details?.email || 'Not provided'}`);
        // TODO: Integrate Resend to send "Hey, you left your Premium upgrade!"
        break;
        
      case 'invoice.payment_failed':
        const invoice = event.data.object;
        // Trigger Dunning Flow
        await sendTelegramAlert(`💳 <b>Payment Failed (Dunning)</b>\nInvoice failed for ${invoice.customer_email}.\nAmount: ${(invoice.amount_due / 100).toFixed(2)}`);
        break;
        
      case 'customer.subscription.deleted':
        const subscription = event.data.object;
        await sendTelegramAlert(`😢 <b>Subscription Cancelled</b>\nCustomer cancelled their Elite plan.`);
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    await sendTelegramAlert(`🚨 <b>Stripe Webhook Error</b>\n` + String(error));
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 400 });
  }
}
