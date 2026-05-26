// POST /api/billing/portal
//
// Opens Stripe's hosted Customer Portal — the user can update their
// card, switch between Single and Multi, view invoices and cancel,
// all without us writing a single payment-management screen.
//
// Body: { email: string }
//
// We resolve the Stripe customer by email and create a portal session.
// The portal needs a return_url — we send the user back to the
// subscription page.

import { NextRequest, NextResponse } from 'next/server';
import { stripe, baseUrl, BillingNotConfiguredError } from '@/lib/stripe';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function allowedCaller(req: NextRequest): boolean {
  const ref = req.headers.get('origin') || req.headers.get('referer') || '';
  if (!ref) return false;
  let refHost: string;
  try { refHost = new URL(ref).host; } catch { return false; }
  if (refHost === (req.headers.get('host') || '')) return true;
  const extra = (process.env.ALLOWED_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return extra.includes(refHost);
}

export async function POST(req: NextRequest) {
  if (!allowedCaller(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let body: { email?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 }); }

  const { email } = body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email required.' }, { status: 400 });
  }

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
