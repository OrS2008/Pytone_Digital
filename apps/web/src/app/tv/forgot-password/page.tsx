'use client';

// Forgot-password — step 1 of the email-driven password reset.
//
// Posts to /api/auth/forgot-password which asks Firebase Authentication
// to email a reset link (Firebase hosts the page where the user picks
// a new password). The page always shows the "Check your inbox"
// confirmation regardless of whether the email exists in our
// database, so a curious visitor can't use this form to enumerate
// registered emails. The server returns the same body shape in both
// cases.

import { useState } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n';
import '../auth/auth.css';

export default function ForgotPassword() {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [busy, setBusy]   = useState(false);
  const [sent, setSent]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.includes('@')) { setError(t('auth.errEmail')); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (r.status === 503) {
        setError(t('auth.errStorage'));
        setBusy(false);
        return;
      }
      if (!r.ok) {
        setError(`${t('auth.errReset')} (${r.status})`);
        setBusy(false);
        return;
      }
      setSent(true);
    } catch (err) {
      setError(`${t('auth.errNetwork')}: ${(err as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <main className="ah-root">
      <Link href="/tv/login" className="ah-topback">{t('auth.backSignIn')}</Link>

      <div className="ah-card">
        <div className="ah-wm">NOVA STREAM</div>

        {!sent ? (
          <>
            <h1 className="ah-title">{t('auth.resetTitle')}</h1>
            <p className="ah-sub">
              {t('auth.resetSub')}
            </p>

            <form onSubmit={submit}>
              <div className="ah-field">
                <label className="ah-label">{t('auth.email')}</label>
                <input
                  className="ah-input"
                  type="email"
                  autoFocus
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {error && <div className="ah-err">{error}</div>}

              <button type="submit" className="ah-btn" disabled={busy}>
                {busy ? t('auth.sending') : t('auth.sendReset')}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="ah-title">{t('auth.checkInbox')}</h1>
            <p className="ah-sub">
              {t('auth.resetSent1')} <b dir="ltr">{email}</b>{t('auth.resetSent2')}
            </p>
            <button
              type="button"
              className="ah-btn"
              style={{
                background: 'rgba(255,255,255,0.04)',
                color: '#E7ECF3',
                border: '1px solid rgba(255,255,255,0.10)',
                boxShadow: 'none',
              }}
              onClick={() => { setSent(false); setEmail(''); }}
            >
              {t('auth.sendAnother')}
            </button>
          </>
        )}

        <div className="ah-bottom">
          {t('auth.remembered')} <Link href="/tv/login" className="ah-link">{t('auth.signIn')}</Link>
        </div>
      </div>
    </main>
  );
}
