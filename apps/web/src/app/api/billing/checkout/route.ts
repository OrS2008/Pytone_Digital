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
import { stripe, priceFor, baseUrl, findOrCreateCustomer, BillingNotConfiguredError } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: { plan?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }
  const { plan, email } = body;

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
      line_items: [{ price: priceFor(plan), quantity: 1 }],
      // 7-day trial regardless of which plan they pick. The user gets a
      // chance to use the product before being charged.
      subscription_data: {
        trial_period_days: 7,
        metadata: { plan, app: 'nova-stream' },
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
        hint: 'Add STRIPE_SECRET_KEY, STRIPE_PRICE_SINGLE and STRIPE_PRICE_MULTI in Netlify → Site settings → Environment variables, then redeploy.',
      }, { status: 503 });
    }
    const msg = (e as Error).message ?? 'unknown';
    return NextResponse.json({ error: `Stripe error: ${msg}` }, { status: 500 });
  }
}
