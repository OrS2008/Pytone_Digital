// Stripe Checkout returns the user here after a successful subscription.
// The success_url is /tv/account/subscription/success?session_id=...
//
// We look up the session on the server to confirm it was actually paid
// (the user could land here by guessing the URL), then show a confirmation
// with the chosen plan + next steps.

import Link from 'next/link';
import { stripe, BillingNotConfiguredError } from '@/lib/stripe';
import Shell from '../../Shell';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

interface Search { searchParams: Promise<{ session_id?: string }> }

export default async function CheckoutSuccess({ searchParams }: Search) {
  const { session_id } = await searchParams;
  if (!session_id) {
    return failure('This page is the landing for a completed checkout. Pick a plan first.');
  }

  let planLabel = 'your plan';
  let email     = '';
  try {
    const s = stripe();
    const session = await s.checkout.sessions.retrieve(session_id, { expand: ['subscription'] });
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return failure('We could not confirm this checkout. If you were charged, please contact support.');
    }
    email = session.customer_email || '';
    const sub  = session.subscription as { metadata?: { plan?: string } } | null;
    const plan = sub?.metadata?.plan === 'multi' ? 'multi' : 'single';
    planLabel  = plan === 'multi' ? 'Multi (4 devices)' : 'Single (1 device)';
  } catch (e) {
    if (e instanceof BillingNotConfiguredError) {
      // Internal hint goes to the function log, not the user.
      console.warn('[billing] success page hit but billing not configured');
      return failure('Billing is temporarily unavailable. If you were charged, please contact support.');
    }
    console.warn('[billing] success page error:', (e as Error).message);
    return failure('We could not confirm this checkout. If you were charged, please contact support.');
  }

  return (
    <Shell active="subscription">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Welcome to Nova Stream</div>
        <h1 className="ac-panel-title">You're on {planLabel} ✓</h1>
        <p className="ac-panel-sub">
          {email ? <>Receipts will go to <b>{email}</b>. </> : null}
          Your 7-day free trial has started — we'll email you a reminder 3 days before the first charge.
          You can change plan or cancel any time from{' '}
          <Link className="ac-auth-link" href="/tv/account/subscription">Subscription</Link>.
        </p>
      </header>

      <div className="ac-card">
        <div className="ac-card-title">Next steps</div>
        <ul style={{ color: 'var(--ns-text-muted)', lineHeight: 1.8, paddingLeft: 18 }}>
          <li>Add your M3U / Xtream playlist in{' '}
            <Link className="ac-auth-link" href="/tv/account/sources">Playlists &amp; EPG</Link> so live channels appear.</li>
          <li>Open <Link className="ac-auth-link" href="/tv/live">Live TV</Link> to start watching.</li>
          <li>Install the LG webOS app or open Nova Stream on your phone — your trial covers all of them.</li>
        </ul>
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <Link className="ac-btn ac-btn-primary" href="/tv/account/sources">Connect a playlist</Link>
          <Link className="ac-btn" href="/tv/live">Go to Live TV</Link>
        </div>
      </div>
    </Shell>
  );
}

function failure(reason: string) {
  return (
    <Shell active="subscription">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Checkout</div>
        <h1 className="ac-panel-title">Something went wrong</h1>
        <p className="ac-panel-sub">{reason}</p>
      </header>
      <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        <Link className="ac-btn ac-btn-primary" href="/tv/account/plans">Try again</Link>
        <Link className="ac-btn" href="/tv/account/subscription">Back to subscription</Link>
      </div>
    </Shell>
  );
}
