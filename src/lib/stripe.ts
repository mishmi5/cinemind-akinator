import Stripe from 'stripe';

// Lazy init: constructing Stripe at module scope throws when STRIPE_SECRET_KEY is unset, which
// crashes `next build` during page-data collection. Returns null instead, and every caller must
// fail closed on null — never proceed as if payments were configured.
let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-05-27.dahlia' });
  }
  return client;
}
