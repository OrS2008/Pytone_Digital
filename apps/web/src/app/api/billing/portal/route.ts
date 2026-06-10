// POST /api/billing/portal
//
// Opens Stripe's hosted Customer Portal — the user can update their
// card, switch between Single and Multi, view invoices and cancel,
// all without us writing a single payment-management screen.
//
// The customer email is taken from the SERVER SESSION, never from the
// request body. An earlier version trusted a client-supplied `email`,
// which let anyone who knew a victim's address open that victim's
// billing portal (view invoices, last-4, cancel their plan). The
// session cookie is now the only source of identity.

import { NextRequest, NextResponse } from 'next/server';
import { stripe, baseUrl, BillingNotConfiguredError } from '@/lib/stripe';
import { getKV } from '@/lib/cfEnv';
import { readSession, readSessionCookie } from '@/lib/auth/serverSession';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
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
    if (!found.data[0]) {
      return NextResponse.json({
        error: 'No subscription found for that email.',
        hint:  'Choose a plan first.',
      }, { status: 404 });
    }
    const session = await s.billingPortal.sessions.create({
      customer: found.data[0].id,
      return_url: `${baseUrl()}/tv/account/subscription`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    if (e instanceof BillingNotConfiguredError) {
      return NextResponse.json({
        error: e.message,
        hint:  'Add STRIPE_SECRET_KEY in the deploy env.',
      }, { status: 503 });
    }
    console.error('[billing/portal] stripe error:', e);
    return NextResponse.json({ error: 'Billing portal is temporarily unavailable.' }, { status: 500 });
  }
}
