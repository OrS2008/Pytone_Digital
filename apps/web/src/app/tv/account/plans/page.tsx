// Plans page — Single (1 device) and Multi (4 devices) side by side
// with a Monthly / Yearly billing toggle. Yearly saves ~17 % vs paying
// month-by-month, which we surface as a badge so the saving is visible
// rather than hidden in the maths.
//
// Clicking a plan POSTs to /api/billing/checkout (with both plan and
// cycle) and redirects to Stripe's hosted Checkout. Trial period is
// always 7 days regardless of cycle — handled in the checkout route.
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Shell from '../Shell';
import { getSessionEmail } from '@/lib/session';

type PlanId  = 'single' | 'multi';
type Cycle   = 'monthly' | 'yearly';

interface PlanPricing {
  monthly: number; // USD per month
  yearly:  number; // USD per year
}
const PRICES: Record<PlanId, PlanPricing> = {
  single: { monthly: 1, yearly: 10 },
  multi:  { monthly: 3, yearly: 30 },
};

// Yearly = 12 × monthly minus the discount. Computed once and shown as
// a "Save N%" pill on the toggle so customers see the benefit.
function yearlyDiscountPct(p: PlanPricing): number {
  const fullYear = p.monthly * 12;
  if (fullYear === 0) return 0;
  return Math.round((1 - p.yearly / fullYear) * 100);
}

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
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [busy,         setBusy]         = useState<null | PlanId>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [showCanceled, setShowCanceled] = useState(false);
  const [cycle,        setCycle]        = useState<Cycle>('yearly');

  useEffect(() => {
    setAccountEmail(getSessionEmail());
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('canceled')) {
      setShowCanceled(true);
    }
  }, []);

  // Both plans get the same yearly discount % by construction; we show
  // the higher of the two so the toggle pill never under-promises.
  const savings = useMemo(
    () => Math.max(yearlyDiscountPct(PRICES.single), yearlyDiscountPct(PRICES.multi)),
    [],
  );

  async function start(plan: PlanId) {
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
        body: JSON.stringify({ plan, cycle, email: accountEmail }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setBusy(null);
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

      {/* Monthly / Yearly switch. The yearly side carries a savings
          pill so the customer can see the benefit without doing maths. */}
      <div className="cycle-toggle" role="tablist" aria-label="Billing cycle">
        <button
          role="tab"
          aria-selected={cycle === 'monthly'}
          className={`cycle-toggle-btn ${cycle === 'monthly' ? 'active' : ''}`}
          onClick={() => setCycle('monthly')}
        >Monthly</button>
        <button
          role="tab"
          aria-selected={cycle === 'yearly'}
          className={`cycle-toggle-btn ${cycle === 'yearly' ? 'active' : ''}`}
          onClick={() => setCycle('yearly')}
        >
          Yearly
          {savings > 0 && <span className="cycle-toggle-save">Save {savings}%</span>}
        </button>
      </div>

      <div className="ac-plans">
        <PlanCard
          id="single"
          recommended
          name="Single"
          headline="For one screen"
          tagline="Perfect if you watch alone or always in the same room."
          pricing={PRICES.single}
          cycle={cycle}
          features={FEATURES_SINGLE}
          busy={busy === 'single'}
          disabled={busy !== null}
          onStart={() => start('single')}
        />
        <PlanCard
          id="multi"
          name="Multi"
          headline="For the whole home"
          tagline="Up to four devices streaming at once. Family profiles included."
          pricing={PRICES.multi}
          cycle={cycle}
          features={FEATURES_MULTI}
          busy={busy === 'multi'}
          disabled={busy !== null}
          onStart={() => start('multi')}
        />
      </div>

      <div style={{ marginTop: 28, fontSize: 13, color: 'var(--ns-text-faint)', textAlign: 'center' }}>
        Payments are processed by our PCI-DSS Level 1 partner. Your card is never stored on
        our servers. PayPal-issued receipts go straight to your PayPal email — no separate
        billing inbox to manage.
      </div>
    </Shell>
  );
}

function PlanCard(props: {
  id:          PlanId;
  recommended?:boolean;
  name:        string;
  headline:    string;
  tagline:     string;
  pricing:     PlanPricing;
  cycle:       Cycle;
  features:    { ok: boolean; label: string }[];
  busy:        boolean;
  disabled:    boolean;
  onStart:     () => void;
}) {
  const amount = props.cycle === 'monthly' ? props.pricing.monthly : props.pricing.yearly;
  const cycleLabel = props.cycle === 'monthly' ? '/ month' : '/ year';
  // Show the equivalent monthly rate underneath when on yearly so the
  // customer can compare apples to apples without recalculating.
  const monthlyEquivalent = props.cycle === 'yearly'
    ? (props.pricing.yearly / 12).toFixed(2)
    : null;
  const ctaCycle = props.cycle === 'monthly' ? '/mo' : '/yr';

  return (
    <div className={`ac-plan ${props.recommended ? 'ac-plan-recommended' : ''}`}>
      {props.recommended && <span className="ac-plan-badge">RECOMMENDED</span>}
      <div className="ac-plan-name">{props.name}</div>
      <h2 className="ac-plan-headline">{props.headline}</h2>
      <p className="ac-plan-tagline">{props.tagline}</p>

      <div className="ac-plan-price">
        <span className="ac-plan-currency">$</span>
        <span className="ac-plan-amount">{amount}</span>
        <span className="ac-plan-cycle">{cycleLabel}</span>
      </div>
      {monthlyEquivalent && (
        <div className="ac-plan-equivalent">
          ≈ ${monthlyEquivalent}/month, billed yearly
        </div>
      )}

      <ul className="ac-plan-features">
        {props.features.map((f, i) => (
          <li key={i} className={f.ok ? '' : 'mute'}>
            <span className="check">{f.ok ? '✓' : '✕'}</span> {f.label}
          </li>
        ))}
      </ul>
      <button
        className={`ac-btn ${props.recommended ? 'ac-btn-primary' : ''}`}
        style={{ justifyContent: 'center', padding: '16px 24px', opacity: props.busy ? 0.7 : 1 }}
        onClick={props.onStart}
        disabled={props.disabled}
      >
        {props.busy ? 'Opening checkout…' : `Start ${props.name} — $${amount}${ctaCycle}`}
      </button>
      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ns-text-faint)', textAlign: 'center' }}>
        7 days free. Cancel any time.
      </div>
    </div>
  );
}
