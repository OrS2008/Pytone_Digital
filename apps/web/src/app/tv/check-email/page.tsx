'use client';

// /tv/check-email — "we sent you a verification link" landing page.
//
// Where the signup form sends the user after a successful signup. The
// account exists in Firebase Auth but cannot sign in until they click
// the link Firebase emailed. We surface the email address + a one-tap
// resend button. Proof of identity for the resend comes from the
// HTTP-only `ns_preverify` cookie /api/auth/signup just set, so the
// user doesn't have to retype the password they just chose.

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@/lib/i18n';
import '../auth/auth.css';

function CheckEmailInner() {
  const { t } = useT();
  const params = useSearchParams();
  const email  = params.get('email') ?? '';
  const [sending, setSending] = useState(false);
  const [msg,     setMsg]     = useState<string | null>(null);
  const [err,     setErr]     = useState<string | null>(null);

  async function resend() {
    setErr(null); setMsg(null); setSending(true);
    try {
      const r = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        credentials: 'include',
      });
      if (r.status === 401) {
        // Pre-verify cookie missing / expired — sign-in is the only
        // way back. Point the user at /tv/login (which itself will
        // redirect them right back here with a fresh cookie when the
        // server detects email_not_verified).
        setErr(t('auth.errExpired'));
      } else if (!r.ok) {
        const body = await r.json().catch(() => ({})) as { detail?: string };
        setErr(`${t('auth.errResend')} (${r.status})${body.detail ? `: ${body.detail}` : '.'}`);
      } else {
        setMsg(t('auth.resent'));
      }
    } catch (e) {
      setErr(`${t('auth.errResend')}: ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="ah-root">
      <Link href="/" className="ah-topback">{t('auth.backHome')}</Link>
      <div className="ah-card">
        <h1 className="ah-title">{t('auth.checkInbox')}</h1>
        <p className="ah-sub" style={{ marginBottom: 18 }}>
          {t('auth.verifySent')}{' '}
          <strong style={{ color: '#fff' }} dir="ltr">{email || t('auth.yourEmail')}</strong>.{' '}
          {t('auth.verifyClick')}
        </p>
        <p className="ah-sub" style={{ fontSize: 13, opacity: 0.75 }}>
          {t('auth.verifyFrom1')} <code dir="ltr">noreply@nova-stream-4ee03.firebaseapp.com</code>{' '}
          {t('auth.verifyFrom2')}
        </p>

        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '24px 0' }} />

        <button
          type="button"
          onClick={resend}
          disabled={sending}
          className="ah-btn"
        >
          {sending ? t('auth.sending') : t('auth.resend')}
        </button>

        {err && <div className="ah-err" style={{ marginTop: 12 }}>{err}</div>}
        {msg && <div style={{ marginTop: 12, color: '#7DF9C6', fontSize: 13 }}>{msg}</div>}

        <p className="ah-sub" style={{ marginTop: 22, textAlign: 'center' }}>
          {t('auth.alreadyVerified')}{' '}
          <Link href="/tv/login" className="ah-link">{t('auth.signInArrow')}</Link>
        </p>
      </div>
    </main>
  );
}

export default function CheckEmailPage() {
  return (
    <Suspense fallback={<main className="ah-root"><div className="ah-card">Loading…</div></main>}>
      <CheckEmailInner />
    </Suspense>
  );
}
