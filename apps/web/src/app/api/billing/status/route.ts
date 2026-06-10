// GET /api/billing/status
//
// Returns the current subscription state for the SIGNED-IN user. The
// frontend uses this on the subscription page so the user sees real
// plan / next invoice / status rather than the mocked "Free Trial"
// copy when they actually have an active sub.
//
// The email comes from the server session, never a query param — an
// earlier `?email=` version let anyone read another account's
// subscription + Stripe customer id.

import { NextRequest, NextResponse } from 'next/server';
import { stripe, BillingNotConfiguredError } from '@/lib/stripe';
import { getKV } from '@/lib/cfEnv';
import { readSession, readSessionCookie } from '@/lib/auth/serverSession';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const kv = getKV();
  if (!kv) return NextResponse.json({ error: 'storage_unconfigured' }, { status: 503 });
  const sid = readSessionCookie(req);
  const session = sid ? await readSession(kv, sid) : null;
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const email = session.email;

  try {
    const s = stripe();
    const found = await s.customers.search({
      query: `email:"${email.replace(/"/g, '\\"')}"`,
      limit: 1,
    });
    const cust = found.data[0];
    if (!cust) return NextResponse.json({ state: 'none' });

    const subs = await s.subscriptions.list({ customer: cust.id, status: 'all', limit: 5 });
    const active = subs.data.find((x) => ['active', 'trialing', 'past_due'].includes(x.status));
    if (!active) return NextResponse.json({ state: 'inactive', customerId: cust.id });

    const plan = (active.metadata?.plan as 'single' | 'multi') ||
                 (typeof cust.metadata?.nova_plan === 'string' ? cust.metadata.nova_plan as 'single' | 'multi' : 'single');
    const item = active.items.data[0];

    return NextResponse.json({
      state:           active.status,
      plan,
      devicesMax:      plan === 'multi' ? 4 : 1,
      currentPeriodEnd: (item?.current_period_end ?? 0) * 1000,
      cancelAt:        active.cancel_at ? active.cancel_at * 1000 : null,
      trialEnd:        active.trial_end ? active.trial_end * 1000 : null,
      customerId:      cust.id,
      subscriptionId:  active.id,
    });
  } catch (e) {
    if (e instanceof BillingNotConfiguredError) {
      return NextResponse.json({ state: 'unconfigured', error: e.message }, { status: 503 });
    }
    console.error('[billing/status] stripe error:', e);
    return NextResponse.json({ error: 'Billing status is temporarily unavailable.' }, { status: 500 });
  }
}
