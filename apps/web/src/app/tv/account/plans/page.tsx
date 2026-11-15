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
import { useT } from '@/lib/i18n';

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
// `label` is an i18n key — PlanCard resolves it with t().
const FEATURES_SINGLE = [
  { ok: true,  label: 'pl.s1' },
  { ok: true,  label: 'pl.s2' },
  { ok: true,  label: 'pl.s3' },
  { ok: true,  label: 'pl.s4' },
  { ok: true,  label: 'pl.s5' },
  { ok: true,  label: 'pl.s6' },
  { ok: true,  label: 'pl.s7' },
  { ok: false, label: 'pl.s8' },
];
const FEATURES_MULTI = [
  { ok: true, label: 'pl.m1' },
  { ok: true, label: 'pl.m2' },
  { ok: true, label: 'pl.m3' },
  { ok: true, label: 'pl.m4' },
  { ok: true, label: 'pl.m5' },
];

export default function Plans() {
  const access = useAccess();
  const { t } = useT();
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
      setError(t('pl.errSignIn'));
      return;
    }
    setBusy(plan);
    try {
      const resp = await fetch('/api/billing/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        // email is derived server-side from the session cookie now
        body: JSON.stringify({ plan, cycle }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setBusy(null);
        if (data.hint || data.error) console.warn('[billing/checkout]', data.error, data.hint ?? '');
        setError(resp.status === 503
          ? t('pl.errBilling')
          : t('pl.errCheckout'));
        return;
      }
      window.location.href = data.url;
    } catch {
      setBusy(null);
      setError(t('pl.errNetwork'));
    }
  }

  return (
    <Shell active="plans">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">{t('pl.eyebrow')}</div>
        <h1 className="ac-panel-title">{t('pl.title')}</h1>
        <p className="ac-panel-sub">
          {t('pl.sub')}
        </p>
      </header>

      {showCanceled && (
        <div className="ac-card" style={{ borderColor: 'var(--ns-border-strong)' }}>
          <div style={{ color: 'var(--ns-text-muted)' }}>
            {t('pl.canceled')}
          </div>
        </div>
      )}

      <div className="ac-card">
        <div className="ac-card-title">{t('pl.billing')}</div>
        {access.email ? (
          <p style={{ fontSize: 14, marginTop: 0, color: 'var(--ns-text-muted)' }}>
            {t('pl.chargesTo')}{' '}
            <strong style={{ color: 'var(--ns-text)' }} dir="ltr">{access.email}</strong>.
          </p>
        ) : access.status === 'loading' ? (
          <p style={{ fontSize: 14, marginTop: 0, color: 'var(--ns-text-faint)' }}>
            {t('acc.loading')}
          </p>
        ) : (
          <p style={{ fontSize: 14, marginTop: 0, color: 'var(--ns-text-muted)' }}>
            {t('pl.needSignIn')}{' '}
            <Link href="/tv/login" className="ac-auth-link">{t('auth.signInArrow')}</Link>
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
        >{t('pl.monthly')}</button>
        <button
          role="tab"
          aria-selected={cycle === 'yearly'}
          className={`cycle-toggle-btn ${cycle === 'yearly' ? 'active' : ''}`}
          onClick={() => setCycle('yearly')}
        >
          {t('pl.yearly')}
          {savings > 0 && <span className="cycle-toggle-save">{t('pl.saveUpTo')} {savings}%</span>}
        </button>
      </div>

      <div className="ac-plans">
        <PlanCard
          id="single"
          recommended
          name={t('pl.single')}
          headline={t('pl.singleHead')}
          tagline={t('pl.singleTag')}
          pricing={PRICES.single}
          cycle={cycle}
          features={FEATURES_SINGLE}
          busy={busy === 'single'}
          disabled={busy !== null}
          onStart={() => start('single')}
        />
        <PlanCard
          id="multi"
          name={t('pl.multi')}
          headline={t('pl.multiHead')}
          tagline={t('pl.multiTag')}
          pricing={PRICES.multi}
          cycle={cycle}
          features={FEATURES_MULTI}
          busy={busy === 'multi'}
          disabled={busy !== null}
          onStart={() => start('multi')}
        />
      </div>

      <div className="ac-card" style={{ marginTop: 22 }}>
        <div className="ac-card-title">{t('pl.roadmap')}</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 13.5, margin: '0 0 8px' }}>
          {t('pl.roadmapBody')}
        </p>
        <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 14, color: 'var(--ns-text-muted)', lineHeight: 1.8 }}>
          <li>{t('pl.road1')}</li>
          <li>{t('pl.road2')}</li>
        </ul>
      </div>

      <div style={{ marginTop: 28, fontSize: 13, color: 'var(--ns-text-faint)', textAlign: 'center' }}>
        {t('pl.stripeNote')}
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
  const { t } = useT();
  const amount = props.cycle === 'monthly' ? props.pricing.monthly : props.pricing.yearly;
  const cycleLabel = props.cycle === 'monthly' ? t('pl.perMonth') : t('pl.perYear');
  const monthlyEquivalent = props.cycle === 'yearly'
    ? (props.pricing.yearly / 12).toFixed(2)
    : null;
  const ctaCycle = props.cycle === 'monthly' ? t('pl.mo') : t('pl.yr');
  const discount = props.cycle === 'yearly' ? yearlyDiscountPct(props.pricing) : 0;
  const fullYear = props.pricing.monthly * 12;

  return (
    <div className={`ac-plan ${props.recommended ? 'ac-plan-recommended' : ''}`}>
      {props.recommended && <span className="ac-plan-badge">{t('pl.recommended')}</span>}
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
          ≈ ${monthlyEquivalent}{t('pl.billedYearly')}
          {discount > 0 && (
            <>
              {' · '}
              <span className="ac-plan-strikethrough">${fullYear}</span>{' '}
              <span style={{ color: 'var(--ns-ok, #7DF9C6)' }}>{t('pl.save')} ${fullYear - props.pricing.yearly}</span>
            </>
          )}
        </div>
      )}

      <ul className="ac-plan-features">
        {props.features.map((f, i) => (
          <li key={i} className={f.ok ? '' : 'mute'}>
            <span className="check">{f.ok ? '✓' : '✕'}</span> {t(f.label)}
          </li>
        ))}
      </ul>
      <button
        className={`ac-btn ${props.recommended ? 'ac-btn-primary' : ''}`}
        style={{ justifyContent: 'center', padding: '16px 24px', opacity: props.busy ? 0.7 : 1 }}
        onClick={props.onStart}
        disabled={props.disabled}
      >
        {props.busy ? t('pl.openingCheckout') : `${t('pl.start')} ${props.name} — $${amount}${ctaCycle}`}
      </button>
      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ns-text-faint)', textAlign: 'center' }}>
        {t('pl.free7')}
      </div>
    </div>
  );
}
