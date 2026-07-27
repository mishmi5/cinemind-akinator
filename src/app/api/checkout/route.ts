import { NextResponse } from 'next/server';
import Stripe from 'stripe';

// One paid plan. 'founder' — ₪99 once, lifetime access, capped at 200 seats.
const VALID_PLAN_TYPES = ['founder'] as const;
type PlanType = typeof VALID_PLAN_TYPES[number];

const FOUNDER_PRICE_AGOROT = 9900; // ₪99.00, VAT included

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

// The request's own origin wins over the env var: a stale NEXT_PUBLIC_BASE_URL
// (it is http://localhost:3000 in .env.local) must never send a paying customer
// back to localhost. If neither is available we throw instead of guessing.
function resolveBaseUrl(req: Request): string {
  const origin = req.headers.get('origin');
  if (origin) return origin;
  const fromEnv = process.env.NEXT_PUBLIC_BASE_URL;
  if (fromEnv) return fromEnv;
  throw new Error('Cannot resolve base URL: request has no Origin header and NEXT_PUBLIC_BASE_URL is unset');
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

    const baseUrl = resolveBaseUrl(req);

    // No payment_method_types: Stripe Checkout then offers every method enabled on
    // the account, Apple Pay and Google Pay included. Hardcoding ['card'] blocks them.
    // ponytail: Bit is not a Stripe method — it needs a local provider (Tranzila /
    // Cardcom / PayPlus) as a second checkout route. Not wired yet.
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'ils',
            product_data: {
              name: 'CineMind מייסד — גישה לכל החיים',
              description: 'תשלום חד-פעמי. פרופיל טעם שמור, חידונים ללא הגבלה, מייל שבועי והיסטוריית ההמלצות.',
            },
            unit_amount: FOUNDER_PRICE_AGOROT,
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/scan?success=true`,
      cancel_url: `${baseUrl}/pricing?canceled=true`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Stripe Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
