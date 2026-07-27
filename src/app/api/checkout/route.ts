import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/types/firebase';
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
// Taking the request's Origin verbatim let an attacker create a genuine Stripe session whose
// success_url pointed at their own domain — the victim really pays us, and Stripe then hands them
// to the attacker's "one more step" page. Only hosts we own are acceptable.
// The cap the pricing page promises. Kept next to the price so the two cannot drift.
const FOUNDER_SEATS = 200;

const ALLOWED_HOSTS = ['cinemind.co.il', 'www.cinemind.co.il', 'localhost:3000', 'localhost:3012'];
function resolveBaseUrl(req: Request): string {
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      const { host, protocol } = new URL(origin);
      if (ALLOWED_HOSTS.includes(host) && (protocol === 'https:' || host.startsWith('localhost'))) return origin;
    } catch { /* not a URL — fall through to the env value */ }
  }
  const fromEnv = process.env.NEXT_PUBLIC_BASE_URL;
  if (fromEnv) return fromEnv;
  throw new Error('Cannot resolve base URL: no allowed Origin and NEXT_PUBLIC_BASE_URL is unset');
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

    // Who is buying. Without this the webhook has nobody to grant access to — the payment lands
    // and no account becomes a founder.
    const uid = typeof body.uid === 'string' && body.uid.length > 0 ? body.uid : undefined;

    // THE 200 SEATS ARE A PROMISE, so they have to be enforced somewhere. The pricing page said
    // "200 מקומות" while checkout would have sold the ten-thousandth one just as happily.
    try {
      const sold = await adminDb.collection(COLLECTIONS.users).where('isPremium', '==', true).count().get();
      if (sold.data().count >= FOUNDER_SEATS) {
        return NextResponse.json({ error: 'Founder seats are sold out', soldOut: true }, { status: 409 });
      }
    } catch (err) {
      // A counting failure must not block a sale; it is logged and the cap is checked again by
      // the webhook grant, which is the write that actually consumes a seat.
      console.error('[checkout] seat count unavailable', err);
    }

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
      client_reference_id: uid,
      metadata: uid ? { uid } : undefined,
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
