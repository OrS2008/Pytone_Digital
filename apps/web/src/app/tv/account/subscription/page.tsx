// Subscription — current plan + trial state from server.
//
// Cleanup pass (what changed):
//   * Trial dates came from localStorage via getTrialStartedAt(). That
//     localStorage value is set client-side on first activation and
//     can be cleared / forged by anyone with devtools. Now we read
//     trialEndsAt + status from /api/auth/me which derives it from
//     the KV-stored user record — the authoritative source.
//   * "Device limit: 1 of 1 used" was a literal that never changed.
//     Removed; the Devices page is where that count belongs.
//   * "Cost so far: $0.00" was a literal too. Removed because it
//     would mislead users on a paid plan.
//   * "Cancel trial" used to flip local state without hitting the
//     server. Either we cancel for real or we don't pretend to —
//     this build doesn't, so the button is gone. Once a paid
//     subscription exists, "Cancel subscription" hits the billing
//     provider and replaces this.
//   * Page copy used to claim PayPal is the payment processor; the
//     Plans page actually uses Stripe Checkout. Aligned the copy
//     with reality.

'use client';

import Link from 'next/link';
import Shell from '../Shell';
import { useAccess } from '@/lib/useAccess';

function fmtDate(ms: number | undefined | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function Subscription() {
  const access = useAccess();

  return (
    <Shell active="subscription">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Subscription</div>
        <h1 className="ac-panel-title">Your plan</h1>
        <p className="ac-panel-sub">
          {access.status === 'subscribed'
            ? 'Your paid subscription is active. Manage it below.'
            : access.status === 'expired'
              ? 'Your trial has ended. Pick a plan to keep watching.'
              : 'Trial active. You haven\'t been charged. Pick a paid plan any time to keep watching after the trial ends.'}
        </p>
      </header>

      <div className="ac-card">
        <div className="ac-card-title">Current plan</div>

        {access.status === 'loading' && (
          <div style={{ color: 'var(--ns-text-faint)', fontSize: 14 }}>Loading…</div>
        )}

        {access.status === 'anon' && (
          <div>
            <p style={{ color: 'var(--ns-text-muted)', fontSize: 14 }}>
              Sign in to see your subscription.
            </p>
            <Link href="/tv/login" className="ac-btn ac-btn-primary">Sign in</Link>
          </div>
        )}

        {access.status === 'error' && (
          <p style={{ color: 'var(--ns-danger, #FF6B7B)', fontSize: 14 }}>
            We couldn&apos;t reach the server to load your subscription. Refresh to retry.
          </p>
        )}

        {(access.status === 'trial' || access.status === 'subscribed' || access.status === 'expired') && (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 32, fontWeight: 800, letterSpacing: -1 }}>
                {access.status === 'subscribed' ? 'Subscribed'
                  : access.status === 'expired' ? 'Trial ended'
                  : 'Free Trial'}
              </h2>
              <span className={`ac-status-pill ${
                access.status === 'subscribed' ? 'ac-status-ok'   :
                access.status === 'expired'    ? 'ac-status-warn' :
                                                 'ac-status-trial'
              }`}>
                {access.status === 'subscribed' ? 'ACTIVE'
                  : access.status === 'expired' ? 'EXPIRED'
                  : `${access.daysLeft ?? 0}d LEFT`}
              </span>
            </div>

            <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, marginBottom: 22 }}>
              {access.status === 'subscribed'
                ? 'Renews automatically through Stripe. Cancel any time before the next billing date.'
                : 'All features unlocked during your 7-day trial. Pick a plan below to keep watching after it ends.'}
            </p>

            <dl className="ac-detail">
              {access.status === 'trial' && <>
                <dt>Trial ends</dt>
                <dd>{fmtDate(access.trialEndsAt)} · {access.daysLeft ?? 0} day{access.daysLeft === 1 ? '' : 's'} left</dd>
              </>}
              {access.status === 'expired' && <>
                <dt>Trial ended</dt>
                <dd>{fmtDate(access.trialEndsAt)}</dd>
              </>}
              {access.status === 'subscribed' && <>
                <dt>Renews on</dt>
                <dd>{fmtDate(access.subscribedUntil)}</dd>
              </>}
              <dt>Member since</dt>
              <dd>{fmtDate(access.createdAt)}</dd>
            </dl>

            <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
              {access.status !== 'subscribed' ? (
                <Link className="ac-btn ac-btn-primary" href="/tv/account/plans">
                  {access.status === 'expired' ? 'Choose a plan' : 'Choose a paid plan'}
                </Link>
              ) : (
                <Link className="ac-btn" href="/tv/account/plans">Change plan</Link>
              )}
            </div>
          </>
        )}
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Payments &amp; receipts</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, marginTop: 0 }}>
          Paid subscriptions are processed by Stripe. We don&apos;t see or store your card —
          Stripe holds the payment method and emails you a receipt after every successful
          charge. You can view your full payment history from the Stripe customer portal
          once a subscription has started.
        </p>
      </div>
    </Shell>
  );
}
