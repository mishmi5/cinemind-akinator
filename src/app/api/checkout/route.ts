import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const VALID_PLAN_TYPES = ['credits', 'elite'] as const;
type PlanType = typeof VALID_PLAN_TYPES[number];

// Lazy init: constructing Stripe at module scope throws when STRIPE_SECRET_KEY
// is unset, which crashes `next build` during page-data collection.
let stripeClient: Stripe | null = null;
function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-05-27.dahlia',
    });
  }
  return stripeClient;
}

export async function POST(req: Request) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json({ error: 'Payments are not configured' }, { status: 503 });
    }
    const body = await req.json();
    const planType = body.planType as string;

    if (!VALID_PLAN_TYPES.includes(planType as PlanType)) {
      return NextResponse.json({ error: 'Invalid plan type' }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    let sessionParams: Stripe.Checkout.SessionCreateParams;

    if (planType === 'elite') {
      // מסלול מנוי מתחדש (Subscription) - 34 ש"ח בחודש
      sessionParams = {
        payment_method_types: ['card'], // Stripe תומך פה אוטומטית ב-Apple/Google Pay
        mode: 'subscription',
        line_items: [
          {
            price_data: {
              currency: 'ils',
              product_data: {
                name: 'CineMind Elite (Subscription)',
                description: 'המלצות ללא הגבלה, פרופיל טעם מתעדכן, טריילרים ללא פרסומות.',
              },
              unit_amount: 3400, // אגורות (34.00 ש"ח)
              recurring: {
                interval: 'month',
              },
            },
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/scan?success=true`,
        cancel_url: `${baseUrl}/pricing?canceled=true`,
      };
    } else {
      // תשלום חד פעמי (One-time) - 50 טוקנים ב-19 ש"ח
      sessionParams = {
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'ils',
              product_data: {
                name: '50 Credits Pack',
                description: '50 קרדיטים לשימוש בזירת ה-AI שלנו.',
              },
              unit_amount: 1900, // אגורות (19.00 ש"ח)
            },
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/scan?success=true`,
        cancel_url: `${baseUrl}/pricing?canceled=true`,
      };
    }

    // יצירת חלון התשלום המאובטח של Stripe
    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Stripe Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}