// Subscription — current plan, next billing, cancel.
//
// Card-on-file / locally-stored invoices have been removed. Payments
// flow through PayPal: PayPal holds the funding source, sends its own
// receipt to the buyer's PayPal email, and is the source of truth for
// transaction history. We just surface a link to PayPal Activity so the
// user can audit charges, plus the current plan state.
'use client';

import { useEffect, useState } from 'react';
import Shell from '../Shell';
import { getTrialStartedAt, getTrialEndsAt } from '@/lib/session';

function fmtDate(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}
function daysLeft(endsAt: number): number {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

export default function Subscription() {
  const [cancelling, setCancelling] = useState(false);
  const [cancelled,  setCancelled]  = useState(false);
  const [trial, setTrial] = useState<{ startedAt: number; endsAt: number }>({ startedAt: 0, endsAt: 0 });

  useEffect(() => {
    setTrial({ startedAt: getTrialStartedAt(), endsAt: getTrialEndsAt() });
  }, []);
  const left = daysLeft(trial.endsAt);

  return (
    <Shell active="subscription">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Subscription</div>
        <h1 className="ac-panel-title">Your plan</h1>
        <p className="ac-panel-sub">
          Trial active. You haven&apos;t been charged. Pick a paid plan any time to keep
          watching when the trial ends. All payments are handled by PayPal — we never see or
          store your card.
        </p>
      </header>

      <div className="ac-card">
        <div className="ac-card-title">Current plan</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 36, fontWeight: 800, letterSpacing: -1 }}>Free Trial</h2>
          <span className="ac-pill"><span className="ac-pill-dot" />Trial</span>
        </div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, marginBottom: 22 }}>
          7-day trial. 1 concurrent device. All features unlocked.
        </p>
        <dl className="ac-detail">
          <dt>Trial started</dt><dd>{fmtDate(trial.startedAt)}</dd>
          <dt>Trial ends</dt><dd>
            {trial.endsAt ? `${fmtDate(trial.endsAt)} · ${left} day${left === 1 ? '' : 's'} left` : '—'}
          </dd>
          <dt>Device limit</dt><dd>1 of 1 used</dd>
          <dt>Cost so far</dt><dd>$0.00</dd>
        </dl>
        <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
          <a className="ac-btn ac-btn-primary" href="/tv/account/plans">Choose a paid plan</a>
          {cancelled ? (
            <span style={{
              padding: '12px 18px', borderRadius: 10,
              background: 'var(--ns-accent-soft)', color: 'var(--ns-accent)',
              fontSize: 13, fontWeight: 700,
            }}>Trial cancelled — access continues until the trial period ends.</span>
          ) : cancelling ? (
            <>
              <button className="ac-btn ac-btn-ghost" onClick={() => setCancelling(false)}>Keep trial</button>
              <button className="ac-btn ac-btn-danger" onClick={() => { setCancelling(false); setCancelled(true); }}>
                Yes, cancel
              </button>
            </>
          ) : (
            <button className="ac-btn ac-btn-ghost" onClick={() => setCancelling(true)}>Cancel trial</button>
          )}
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Payments &amp; receipts</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, marginTop: 0 }}>
          We never store payment methods. Every subscription charge runs through your PayPal
          account; PayPal emails you a receipt for each one and keeps the full history on
          their side.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <a
            className="ac-btn"
            href="https://www.paypal.com/myaccount/activity"
            target="_blank"
            rel="noopener noreferrer"
          >
            View activity on PayPal ↗
          </a>
        </div>
      </div>
    </Shell>
  );
}
