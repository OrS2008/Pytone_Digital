// Plans page — Single (1 device) and Multi (4 devices) side by side.
// Clicking a plan posts to /api/billing/checkout and redirects to
// Stripe's hosted Checkout. Trial starts after the user enters a card
// (Stripe handles the 7-day trial logic).
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '../Shell';
import { getSessionEmail } from '@/lib/session';

const FEATURES_SINGLE = [
  { ok: true,  label: '1 device at a time' },
  { ok: true,  label: 'Live TV + your M3U / Xtream / Stalker' },
  { ok: true,  label: 'Personal EPG + posters' },
  { ok: true,  label: '14-day cloud DVR + catch-up' },
  { ok: true,  label: 'Restart programme from beginning' },
  { ok: true,  label: 'AI playback failover' },
  { ok: true,  label: 'Watch on TV, phone, tablet, web' },
  { ok: false, label: 'Watch on more than 1 device at the same time' },
];
const FEATURES_MULTI = [
  { ok: true, label: 'Up to 4 devices at the same time' },
  { ok: true, label: 'Everything in Single' },
  { ok: true, label: 'Family profiles + per-profile parental controls' },
  { ok: true, label: 'Per-profile favourites & watch history' },
  { ok: true, label: 'Shared DVR library' },
  { ok: true, label: 'Spoiler protection for sports' },
  { ok: true, label: 'Priority customer support' },
];

export default function Plans() {
  // The signed-in account email is the source of truth for billing now —
  // we used to ask the user to type a "billing email" before checkout,
  // but that's redundant (we already know who they are) and easy to
  // mistype. PayPal also sends its own receipt to the buyer's PayPal
  // email regardless of what we pass through, so collecting a second
  // address was double-prompting for nothing.
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [busy,         setBusy]         = useState<null | 'single' | 'multi'>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [showCanceled, setShowCanceled] = useState(false);

  useEffect(() => {
    setAccountEmail(getSessionEmail());
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('canceled')) {
      setShowCanceled(true);
    }
  }, []);

  async function start(plan: 'single' | 'multi') {
    setError(null);
    if (!accountEmail) {
      setError('Please sign in before choosing a plan.');
      return;
    }
    setBusy(plan);
    try {
      const resp = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan, email: accountEmail }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setBusy(null);
        // Log the deploy-side detail to the console for debugging, but
        // show the end user a generic message — they don't need to
        // see env-var names or backend hints.
        if (data.hint || data.error) console.warn('[billing/checkout]', data.error, data.hint ?? '');
        setError(resp.status === 503
          ? 'Billing is temporarily unavailable. Please try again in a few minutes.'
          : 'Sorry, we could not start checkout right now.');
        return;
      }
      window.location.href = data.url;
    } catch {
      setBusy(null);
      setError('Network error. Please check your connection and try again.');
    }
  }

  return (
    <Shell active="plans">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Choose a plan</div>
        <h1 className="ac-panel-title">Pick what fits your home</h1>
        <p className="ac-panel-sub">
          Both plans include every feature in the app. The only difference is how many
          devices can stream at the same time. 7-day free trial, no charge until day 8.
          Cancel any time.
        </p>
      </header>

      {showCanceled && (
        <div className="ac-card" style={{ borderColor: 'var(--ns-border-strong)' }}>
          <div style={{ color: 'var(--ns-text-muted)' }}>
            Checkout was cancelled. Nothing was charged.
          </div>
        </div>
      )}

      <div className="ac-card">
        <div className="ac-card-title">Billing account</div>
        {accountEmail ? (
          <p style={{ fontSize: 14, marginTop: 0, color: 'var(--ns-text-muted)' }}>
            Charges and PayPal receipts will go to <strong style={{ color: 'var(--ns-text)' }}>{accountEmail}</strong>.
          </p>
        ) : (
          <p style={{ fontSize: 14, marginTop: 0, color: 'var(--ns-text-muted)' }}>
            You need to be signed in before choosing a plan. <Link href="/tv/login" className="live-status-link">Sign in →</Link>
          </p>
        )}
        {error && (
          <div style={{ color: 'var(--ns-danger, #FF6B7B)', fontSize: 13, marginTop: 10 }}>{error}</div>
        )}
      </div>

      <div className="ac-plans">
        <div className="ac-plan ac-plan-recommended">
          <span className="ac-plan-badge">RECOMMENDED</span>
          <div className="ac-plan-name">Single</div>
          <h2 className="ac-plan-headline">For one screen</h2>
          <p className="ac-plan-tagline">Perfect if you watch alone or always in the same room.</p>

          <div className="ac-plan-price">
            <span className="ac-plan-currency">₪</span>
            <span className="ac-plan-amount">39</span>
            <span className="ac-plan-cycle">/ month</span>
          </div>

          <ul className="ac-plan-features">
            {FEATURES_SINGLE.map((f, i) => (
              <li key={i} className={f.ok ? '' : 'mute'}>
                <span className="check">{f.ok ? '✓' : '✕'}</span> {f.label}
              </li>
            ))}
          </ul>
          <button
            className="ac-btn ac-btn-primary"
            style={{ justifyContent: 'center', padding: '16px 24px', opacity: busy ? 0.7 : 1 }}
            onClick={() => start('single')}
            disabled={busy !== null}
          >
            {busy === 'single' ? 'Opening checkout…' : 'Start Single — ₪39/mo'}
          </button>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ns-text-faint)', textAlign: 'center' }}>
            7 days free. Cancel any time.
          </div>
        </div>

        <div className="ac-plan">
          <div className="ac-plan-name">Multi</div>
          <h2 className="ac-plan-headline">For the whole home</h2>
          <p className="ac-plan-tagline">Up to four devices streaming at once. Family profiles included.</p>

          <div className="ac-plan-price">
            <span className="ac-plan-currency">₪</span>
            <span className="ac-plan-amount">69</span>
            <span className="ac-plan-cycle">/ month</span>
          </div>

          <ul className="ac-plan-features">
            {FEATURES_MULTI.map((f, i) => (
              <li key={i}>
                <span className="check">✓</span> {f.label}
              </li>
            ))}
          </ul>
          <button
            className="ac-btn"
            style={{ justifyContent: 'center', padding: '16px 24px', opacity: busy ? 0.7 : 1 }}
            onClick={() => start('multi')}
            disabled={busy !== null}
          >
            {busy === 'multi' ? 'Opening checkout…' : 'Start Multi — ₪69/mo'}
          </button>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ns-text-faint)', textAlign: 'center' }}>
            7 days free. Cancel any time.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 28, fontSize: 13, color: 'var(--ns-text-faint)', textAlign: 'center' }}>
        Payments are processed by our PCI-DSS Level 1 partner. Your card is never stored on
        our servers. PayPal-issued receipts go straight to your PayPal email — no separate
        billing inbox to manage.
      </div>
    </Shell>
  );
}
