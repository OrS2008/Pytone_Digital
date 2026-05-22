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
      console.log('[billing] checkout completed', { customerId, subId, plan, email: session.customer_email });
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
