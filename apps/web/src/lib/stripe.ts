// Stripe client + helpers.
//
// All four billing routes (checkout, webhook, portal, status) share this
// module. We instantiate the SDK lazily and surface a single typed error
// when the secret key is missing — that makes the deploy story explicit:
// drop STRIPE_SECRET_KEY into Netlify's env, the endpoints come alive.

import Stripe from 'stripe';

export class BillingNotConfiguredError extends Error {
  constructor() { super('Billing is not configured. Set STRIPE_SECRET_KEY in the deploy env.'); }
}

let cached: Stripe | null = null;

export function stripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new BillingNotConfiguredError();
  cached = new Stripe(key, {
    // Pin the API version. Stripe makes breaking changes silently on
    // unpinned accounts; pinning means deploys are deterministic.
    apiVersion: '2026-04-22.dahlia',
    typescript: true,
    appInfo: { name: 'Nova Stream', version: '0.1.0' },
  });
  return cached;
}

// Price IDs come from env so the same code path works in test mode
// (price_test_...) and live mode (price_live_...). The two plans are
// the only paid options.
export function priceFor(plan: 'single' | 'multi'): string {
  const id = plan === 'single' ? process.env.STRIPE_PRICE_SINGLE : process.env.STRIPE_PRICE_MULTI;
  if (!id) throw new Error(`Missing env STRIPE_PRICE_${plan.toUpperCase()}.`);
  return id;
}

// Base URL of the deployed site, used for Stripe's success_url /
// cancel_url. Netlify sets URL automatically on every deploy; we fall
// back to the canonical hostname.
export function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.URL ||
    'https://novastram.netlify.app'
  ).replace(/\/$/, '');
}

// Look up an existing customer by email, or create one. Stripe's
// `customers.search` is the canonical way to do this — we do not maintain
// a local user table in this build, so email is the identity key.
export async function findOrCreateCustomer(email: string): Promise<Stripe.Customer> {
  const s = stripe();
  // email-based search is exact and indexed.
  const found = await s.customers.search({
    query: `email:"${email.replace(/"/g, '\\"')}"`,
    limit: 1,
  });
  if (found.data[0]) return found.data[0];
  return s.customers.create({
    email,
    metadata: { source: 'nova-stream-web' },
  });
}
