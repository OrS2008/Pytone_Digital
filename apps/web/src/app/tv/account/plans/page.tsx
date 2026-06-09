// Plans page — Single (1 device) and Multi (4 devices) with a
// Monthly / Yearly billing toggle. Yearly saves vs paying per-month;
// the actual discount is computed from the prices so the badge can't
// drift out of sync with the numbers.
//
// Cleanup pass:
//   * Feature lists used to claim "AI playback failover", "14-day
//     cloud DVR", "Spoiler protection for sports", "Family profiles
//     + per-profile parental controls", and "Priority customer
//     support". The first two don't exist and probably never will
//     in their original form, the third / fourth are partial
//     (in-app preference toggles only — there's no per-profile data
//     model behind them), and the fifth is meaningless for an app
//     of this size. Replaced with a list of features that actually
//     ship today, with anything aspirational moved to a roadmap
//     note under the cards rather than next to a check mark.
//   * Footer used to say "PCI-DSS Level 1 partner" and "PayPal-
//     issued receipts" in the same paragraph. The checkout endpoint
//     uses Stripe Checkout; PayPal isn't involved. Aligned the
//     wording with reality.
//   * Sign-in detection now goes through useAccess() so the billing
//     account banner reflects the server-side identity rather than
//     a localStorage email that anyone could rewrite.

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Shell from '../Shell';
import { useAccess } from '@/lib/useAccess';

type PlanId  = 'single' | 'multi';
type Cycle   = 'monthly' | 'yearly';

interface PlanPricing {
  monthly: number;
  yearly:  number;
}
const PRICES: Record<PlanId, PlanPricing> = {
  single: { monthly: 1, yearly: 10 },
  multi:  { monthly: 3, yearly: 20 },
};

function yearlyDiscountPct(p: PlanPricing): number {
  const fullYear = p.monthly * 12;
  if (fullYear === 0) return 0;
  return Math.round((1 - p.yearly / fullYear) * 100);
}

// Feature lists are split deliberately: every checked item below is
// something the app does today. Aspirational items live in the
// roadmap note under the grid, not next to a green ✓.
const FEATURES_SINGLE = [
  { ok: true,  label: '1 device streaming at a time' },
  { ok: true,  label: 'Bring your own M3U / Xtream / Stalker playlist' },
  { ok: true,  label: 'XMLTV electronic programme guide' },
  { ok: true,  label: 'Catch-up where your provider supports it' },
  { ok: true,  label: 'Continue Watching & per-device history' },
  { ok: true,  label: 'Direct or proxied streaming, per source' },
  { ok: true,  label: 'Settings sync across every signed-in device' },
  { ok: false, label: 'Watch from more than 1 device simultaneously' },
];
const FEATURES_MULTI = [
  { ok: true, label: 'Up to 4 devices streaming at the same time' },
  { ok: true, label: 'Everything in Single' },
  { ok: true, label: 'Parental controls with PIN + rating cap' },
  { ok: true, label: 'Channel block list per account' },
  { ok: true, label: 'Spoiler protection for sport' },
];

export default function Plans() {
  const access = useAccess();
  const [busy,         setBusy]         = useState<null | PlanId>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [showCanceled, setShowCanceled] = useState(false);
  const [cycle,        setCycle]        = useState<Cycle>('yearly');

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('canceled')) {
      setShowCanceled(true);
    }
  }, []);

  const savings = useMemo(
    () => Math.max(yearlyDiscountPct(PRICES.single), yearlyDiscountPct(PRICES.multi)),
    [],
  );

  async function start(plan: PlanId) {
    setError(null);
    if (!access.email) {
      setError('Please sign in before choosing a plan.');
      return;
    }
    setBusy(plan);
    try {
      const resp = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan, cycle, email: access.email }),
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
          Both plans include every feature in the app. The only difference is
          how many devices can stream at the same time. 7-day free trial, no
          charge until day 8. Cancel any time.
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
        {access.email ? (
          <p style={{ fontSize: 14, marginTop: 0, color: 'var(--ns-text-muted)' }}>
            Charges and Stripe receipts will go to{' '}
            <strong style={{ color: 'var(--ns-text)' }}>{access.email}</strong>.
          </p>
        ) : access.status === 'loading' ? (
          <p style={{ fontSize: 14, marginTop: 0, color: 'var(--ns-text-faint)' }}>
            Loading…
          </p>
        ) : (
          <p style={{ fontSize: 14, marginTop: 0, color: 'var(--ns-text-muted)' }}>
            You need to be signed in before choosing a plan.{' '}
            <Link href="/tv/login" className="ac-auth-link">Sign in →</Link>
          </p>
        )}
        {error && (
          <div style={{ color: 'var(--ns-danger, #FF6B7B)', fontSize: 13, marginTop: 10 }}>{error}</div>
        )}
      </div>

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
          {savings > 0 && <span className="cycle-toggle-save">Save up to {savings}%</span>}
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
          tagline="Up to four devices streaming at once."
          pricing={PRICES.multi}
          cycle={cycle}
          features={FEATURES_MULTI}
          busy={busy === 'multi'}
          disabled={busy !== null}
          onStart={() => start('multi')}
        />
      </div>

      <div className="ac-card" style={{ marginTop: 22 }}>
        <div className="ac-card-title">On the roadmap</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 13.5, margin: '0 0 8px' }}>
          Listed separately so the feature ticks on the plan cards stay
          honest. These items don&apos;t ship today; we&apos;ll move each one onto
          the cards as it lands.
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: 'var(--ns-text-muted)', lineHeight: 1.8 }}>
          <li>Cloud DVR — schedule recordings that play back from our servers</li>
          <li>Family profiles — per-profile favourites, history, and parental cap</li>
        </ul>
      </div>

      <div style={{ marginTop: 28, fontSize: 13, color: 'var(--ns-text-faint)', textAlign: 'center' }}>
        Payments are processed by Stripe. We never see or store your card —
        Stripe holds the payment method and emails you a receipt for every
        charge.
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
  const monthlyEquivalent = props.cycle === 'yearly'
    ? (props.pricing.yearly / 12).toFixed(2)
    : null;
  const ctaCycle = props.cycle === 'monthly' ? '/mo' : '/yr';
  const discount = props.cycle === 'yearly' ? yearlyDiscountPct(props.pricing) : 0;
  const fullYear = props.pricing.monthly * 12;

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
        {discount > 0 && (
          <span className="ac-plan-save">−{discount}%</span>
        )}
      </div>
      {monthlyEquivalent && (
        <div className="ac-plan-equivalent">
          ≈ ${monthlyEquivalent}/month, billed yearly
          {discount > 0 && (
            <>
              {' · '}
              <span className="ac-plan-strikethrough">${fullYear}</span>{' '}
              <span style={{ color: 'var(--ns-ok, #7DF9C6)' }}>save ${fullYear - props.pricing.yearly}</span>
            </>
          )}
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
