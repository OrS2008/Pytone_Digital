// POST /api/billing/checkout
//
// Creates a Stripe Checkout Session for the chosen plan and returns the
// hosted-checkout URL. The frontend redirects the user there; on success
// or cancel Stripe sends them back to /tv/account/subscription with a
// query flag we read on the success page.
//
// Body: { plan: 'single' | 'multi', email: string }
//
// Stripe Checkout (rather than Elements) is the right choice here:
//   - Card data never touches our origin → PCI scope is SAQ A.
//   - Strong Customer Authentication / 3-D Secure is automatic.
//   - Apple Pay, Google Pay, Link, regional payment methods are free.
//
// The webhook (separate route) is what actually flips a user to "paid".
// Without the webhook, this endpoint is just a checkout-link factory.

import { NextRequest, NextResponse } from 'next/server';
import { stripe, priceFor, baseUrl, findOrCreateCustomer, BillingNotConfiguredError, type Cycle } from '@/lib/stripe';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Same-origin gate. Self-detects the deploy host by comparing the
// caller's Origin/Referer with the host header on this request; an
// extra-hosts allowlist via ALLOWED_HOSTS env covers CDN/custom-domain
// setups. Hard-coding any one hostname here would silently break on
// every other platform.
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

  let body: { plan?: string; cycle?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }
  const { plan, email } = body;
  // Default to monthly when the caller omits cycle so older clients
  // (and the legacy "Start Single" button without a toggle) keep working.
  const cycle: Cycle = body.cycle === 'yearly' ? 'yearly' : 'monthly';

  if (plan !== 'single' && plan !== 'multi') {
    return NextResponse.json({ error: 'plan must be "single" or "multi".' }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email required.' }, { status: 400 });
  }

  try {
    const s = stripe();
    const customer = await findOrCreateCustomer(email);
    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      line_items: [{ price: priceFor(plan, cycle), quantity: 1 }],
      // 7-day trial regardless of which plan they pick. The user gets a
      // chance to use the product before being charged.
      subscription_data: {
        trial_period_days: 7,
        metadata: { plan, cycle, app: 'nova-stream' },
      },
      success_url: `${baseUrl()}/tv/account/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl()}/tv/account/plans?canceled=1`,
      // Save the card for future invoices.
      payment_method_collection: 'if_required',
      allow_promotion_codes: true,
      automatic_tax: { enabled: false },
      billing_address_collection: 'auto',
      // Surface our app identity on the receipt.
      custom_text: {
        submit: { message: 'Your trial starts now. We will email you a reminder 3 days before the first charge.' },
      },
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (e) {
    if (e instanceof BillingNotConfiguredError) {
      return NextResponse.json({
        error: e.message,
        hint: 'Add STRIPE_SECRET_KEY and the four price IDs (STRIPE_PRICE_SINGLE_MONTHLY / _YEARLY, STRIPE_PRICE_MULTI_MONTHLY / _YEARLY) in your deploy platform\'s environment variables, then redeploy.',
      }, { status: 503 });
    }
    // Log the real reason server-side so it shows up in deploy logs,
    // but return an opaque message to the client. Stripe errors can
    // include API keys, customer ids, and rate-limit details that
    // shouldn't ride out to the browser.
    console.error('[billing/checkout] stripe error:', e);
    return NextResponse.json({ error: 'Checkout is temporarily unavailable. Please try again.' }, { status: 500 });
  }
}
