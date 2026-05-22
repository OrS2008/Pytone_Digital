// POST /api/billing/webhook
//
// Stripe → Nova Stream event sink. Required for any real account state
// to flip on or off based on payment, because:
//   - the user can close their browser between Checkout submit and
//     redirect, so the success_url is unreliable as the source of truth,
//   - subscription state changes (renewal, dunning, cancellation) happen
//     long after Checkout and never touch the browser.
//
// What we handle:
//   checkout.session.completed       → mark the customer paid, capture
//                                       the subscription_id + email.
//   customer.subscription.updated    → reflect plan changes / trial ends
//                                       / past-due transitions.
//   customer.subscription.deleted    → revoke access at period end.
//
// Where the data lands:
//   Today: console + Netlify function log + a Stripe customer metadata
//          flag (`nova_state`). That's enough for the customer portal +
//          /api/billing/status to compute the right answer.
//   Tomorrow: the auth-service Postgres row in `subscriptions` (the
//          schema is already in place at services/auth/migrations/
//          0002_subscriptions.sql).
//
// Signature verification is mandatory — without it anyone on the
// internet can forge subscription events.

import { NextRequest, NextResponse } from 'next/server';
import { stripe, BillingNotConfiguredError } from '@/lib/stripe';
import type Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Stripe's signature verification needs the raw body bytes, not the
// parsed JSON, otherwise the HMAC won't match. NextRequest exposes
// req.text() which preserves the original wire bytes.
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({
      error: 'STRIPE_WEBHOOK_SECRET not set.',
      hint:  'Create the webhook in Stripe → Developers → Webhooks pointing to /api/billing/webhook, copy the signing secret to the Netlify env, redeploy.',
    }, { status: 503 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Missing stripe-signature header.' }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    return NextResponse.json({ error: `Bad signature: ${(e as Error).message}` }, { status: 400 });
  }

  // Idempotency: Stripe retries any non-2xx with exponential backoff,
  // and even successful webhooks can arrive twice during DNS / TLS
  // hiccups. Dedupe by event.id within a sliding window so the same
  // checkout.session.completed doesn't flip the customer state twice.
  if (seenEvent(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await handle(event);
    return NextResponse.json({ received: true });
  } catch (e) {
    if (e instanceof BillingNotConfiguredError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    // Returning 500 makes Stripe retry with exponential backoff, which
    // is what we want for transient failures (DB unavailable, etc.).
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Per-instance dedupe window. The Netlify Function may cold-start
// between deliveries, so this is best-effort — Stripe events are also
// idempotent on their own customer-metadata writes, so a duplicate
// causes no harm even when the cache misses.
const SEEN: Map<string, number> = new Map();
const SEEN_TTL_MS = 10 * 60_000;
function seenEvent(id: string): boolean {
  const now = Date.now();
  // Sweep expired entries on every check so the map can't grow without
  // bound on a long-lived worker.
  for (const [k, t] of SEEN) if (now - t > SEEN_TTL_MS) SEEN.delete(k);
  if (SEEN.has(id)) return true;
  SEEN.set(id, now);
  return false;
}

async function handle(event: Stripe.Event) {
  const s = stripe();
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
      const subId      = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
      if (!customerId || !subId) break;
      const sub = await s.subscriptions.retrieve(subId);
      const plan = (sub.metadata?.plan || 'single') as 'single' | 'multi';
      await s.customers.update(customerId, {
        metadata: {
          nova_state: 'active',
          nova_plan:  plan,
          nova_sub:   subId,
        },
      });
      // Mask the local-part of the email in logs so customer-support
      // queries can grep by domain but the log itself isn't a PII dump.
      const masked = session.customer_email?.replace(/^(.).+(@.+)$/, '$1***$2');
      console.log('[billing] checkout completed', { customerId, subId, plan, email: masked });
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      const plan = (sub.metadata?.plan || 'single') as 'single' | 'multi';
      const novaState =
        sub.status === 'active'   ? 'active'   :
        sub.status === 'trialing' ? 'trialing' :
        sub.status === 'past_due' ? 'past_due' :
        'inactive';
      await s.customers.update(customerId, {
        metadata: { nova_state: novaState, nova_plan: plan, nova_sub: sub.id },
      });
      console.log('[billing] subscription updated', { customerId, status: sub.status, plan });
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      await s.customers.update(customerId, {
        metadata: { nova_state: 'canceled', nova_sub: sub.id },
      });
      console.log('[billing] subscription canceled', { customerId });
      break;
    }

    default:
      // We deliberately don't handle every event. Stripe sends ~30
      // event types and acknowledging the ones we don't care about is
      // fine — the webhook endpoint still 200s.
      break;
  }
}
