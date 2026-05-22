// Plans page — Single (1 device) and Multi (4 devices) side by side.
// Clicking a plan posts to /api/billing/checkout and redirects to
// Stripe's hosted Checkout. Trial starts after the user enters a card
// (Stripe handles the 7-day trial logic).
'use client';

import { useEffect, useState } from 'react';
import Shell from '../Shell';

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
  const [email,   setEmail]   = useState('');
  const [busy,    setBusy]    = useState<null | 'single' | 'multi'>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [showCanceled, setShowCanceled] = useState(false);

  // Remember the email between checkouts so the second visit pre-fills.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ns.billing.email');
      if (saved) setEmail(saved);
    } catch { /* private mode */ }
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('canceled')) {
      setShowCanceled(true);
    }
  }, []);

  async function start(plan: 'single' | 'multi') {
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter the email you want billed to.');
      return;
    }
    setBusy(plan);
    try { localStorage.setItem('ns.billing.email', email); } catch { /* ignore */ }
    try {
      const resp = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan, email }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setBusy(null);
        setError(data.hint ? `${data.error} ${data.hint}` : data.error || `Server returned ${resp.status}.`);
        return;
      }
      window.location.href = data.url;
    } catch (e) {
      setBusy(null);
      setError(`Network error: ${(e as Error).message}`);
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
        <div className="ac-card-title">Where should we send receipts?</div>
        <div className="ac-field" style={{ marginBottom: 0 }}>
          <input
            className="ac-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="ac-field-help">
            We use this email to identify your subscription. The card itself stays on Stripe — Nova Stream never sees it.
          </div>
        </div>
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
            {busy === 'single' ? 'Opening Stripe…' : 'Start Single — ₪39/mo'}
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
            {busy === 'multi' ? 'Opening Stripe…' : 'Start Multi — ₪69/mo'}
          </button>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ns-text-faint)', textAlign: 'center' }}>
            7 days free. Cancel any time.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 28, fontSize: 13, color: 'var(--ns-text-faint)', textAlign: 'center' }}>
        Payments processed by Stripe. Your card is never stored on our servers.
        VAT included where applicable.
      </div>
    </Shell>
  );
}
