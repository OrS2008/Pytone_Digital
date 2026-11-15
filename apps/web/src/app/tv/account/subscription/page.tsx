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

import { useState } from 'react';
import Link from 'next/link';
import Shell from '../Shell';
import { useAccess } from '@/lib/useAccess';
import { useT, getLocale } from '@/lib/i18n';

function fmtDate(ms: number | undefined | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString(getLocale() === 'he' ? 'he-IL' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function Subscription() {
  const access = useAccess();
  const { t } = useT();
  const [portalBusy,  setPortalBusy]  = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  // Open the Stripe Customer Portal in a new tab. The endpoint mints
  // a one-shot URL from the user's Stripe customer id (looked up via
  // the session cookie) — we don't have the URL up-front because
  // Stripe wants it minted per session for security.
  async function openPortal() {
    setPortalBusy(true); setPortalError(null);
    try {
      const r = await fetch('/api/billing/portal', { method: 'POST', credentials: 'include' });
      if (r.status === 401) { setPortalError(t('sub.errSignIn')); return; }
      if (r.status === 404) { setPortalError(t('sub.errNoCustomer')); return; }
      if (!r.ok)            { setPortalError(`${t('sub.errPortal')} (${r.status}).`); return; }
      const body = await r.json() as { url?: string };
      if (body.url) window.location.href = body.url;
      else          setPortalError(t('sub.errNoUrl'));
    } catch (e) {
      setPortalError(`${t('sub.errOpen')}: ${(e as Error).message}`);
    } finally {
      setPortalBusy(false);
    }
  }

  return (
    <Shell active="subscription">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">{t('sub.eyebrow')}</div>
        <h1 className="ac-panel-title">{t('sub.title')}</h1>
        <p className="ac-panel-sub">
          {access.status === 'subscribed'
            ? t('sub.subPaid')
            : access.status === 'expired'
              ? t('sub.subExpired')
              : t('sub.subTrial')}
        </p>
      </header>

      <div className="ac-card">
        <div className="ac-card-title">{t('sub.current')}</div>

        {access.status === 'loading' && (
          <div style={{ color: 'var(--ns-text-faint)', fontSize: 14 }}>{t('acc.loading')}</div>
        )}

        {access.status === 'anon' && (
          <div>
            <p style={{ color: 'var(--ns-text-muted)', fontSize: 14 }}>
              {t('sub.signInTo')}
            </p>
            <Link href="/tv/login" className="ac-btn ac-btn-primary">{t('auth.signIn')}</Link>
          </div>
        )}

        {access.status === 'error' && (
          <p style={{ color: 'var(--ns-danger, #FF6B7B)', fontSize: 14 }}>
            {t('sub.unreach')}
          </p>
        )}

        {(access.status === 'trial' || access.status === 'subscribed' || access.status === 'expired') && (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 32, fontWeight: 800, letterSpacing: -1 }}>
                {access.status === 'subscribed' ? t('acc.planSubscribed')
                  : access.status === 'expired' ? t('acc.trialEndedShort')
                  : t('acc.planTrial')}
              </h2>
              <span className={`ac-status-pill ${
                access.status === 'subscribed' ? 'ac-status-ok'   :
                access.status === 'expired'    ? 'ac-status-warn' :
                                                 'ac-status-trial'
              }`}>
                {access.status === 'subscribed' ? t('sub.active')
                  : access.status === 'expired' ? t('acc.pillExpired')
                  : `${access.daysLeft ?? 0}${t('acc.dLeft')}`}
              </span>
            </div>

            <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, marginBottom: 22 }}>
              {access.status === 'subscribed'
                ? t('sub.renewNote')
                : t('sub.trialNote')}
            </p>

            <dl className="ac-detail">
              {access.status === 'trial' && <>
                <dt>{t('acc.trialEnds')}</dt>
                <dd>{fmtDate(access.trialEndsAt)} · {access.daysLeft ?? 0} {t('sub.daysLeft')}</dd>
              </>}
              {access.status === 'expired' && <>
                <dt>{t('acc.trialEndedShort')}</dt>
                <dd>{fmtDate(access.trialEndsAt)}</dd>
              </>}
              {access.status === 'subscribed' && <>
                <dt>{t('acc.renewsOn')}</dt>
                <dd>{fmtDate(access.subscribedUntil)}</dd>
              </>}
              <dt>{t('acc.memberSince')}</dt>
              <dd>{fmtDate(access.createdAt)}</dd>
            </dl>

            <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
              {access.status !== 'subscribed' ? (
                <Link className="ac-btn ac-btn-primary" href="/tv/account/plans">
                  {access.status === 'expired' ? t('sub.choose') : t('sub.choosePaid')}
                </Link>
              ) : (
                <Link className="ac-btn" href="/tv/account/plans">{t('acc.changePlan')}</Link>
              )}
            </div>
          </>
        )}
      </div>

      <div className="ac-card">
        <div className="ac-card-title">{t('sub.payments')}</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, marginTop: 0 }}>
          {t('sub.paymentsBody')}
        </p>
        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="ac-btn"
            onClick={openPortal}
            disabled={portalBusy || access.status !== 'subscribed'}
            title={access.status === 'subscribed' ? t('sub.portalTitle') : t('sub.portalFirst')}
          >
            {portalBusy ? t('sub.opening') : `${t('sub.manageStripe')} ${t('acc.arrow')}`}
          </button>
          {portalError && (
            <span style={{ color: 'var(--ns-danger, #FF6B7B)', fontSize: 13 }}>{portalError}</span>
          )}
        </div>
      </div>
    </Shell>
  );
}
