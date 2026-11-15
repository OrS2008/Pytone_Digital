'use client';

// Sign-up screen. Email + password; account is created in Firebase
// Auth but stays SIGNED OUT until the user clicks the verification
// link Firebase sent them. On success we redirect to /tv/check-email
// instead of /tv. Google sign-in still goes straight through because
// Google asserts `email_verified=true`.

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setSessionEmail, setActivated } from '@/lib/session';
import GoogleSection from '@/components/auth/GoogleSection';
import { useT } from '@/lib/i18n';
import '../auth/auth.css';

export default function Signup() {
  const router = useRouter();
  const { t, locale } = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleGoogle(user: { email: string; name?: string | null; picture?: string | null }) {
    setError(null);
    setSessionEmail(user.email);
    setActivated(true); // Google asserted email_verified=true.
    try {
      if (user.name)    localStorage.setItem('ns.session.name',    user.name);
      if (user.picture) localStorage.setItem('ns.session.picture', user.picture);
    } catch { /* ignore */ }
    router.push('/tv/home');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.includes('@')) return setError(t('auth.errEmail'));
    if (password.length < 8)   return setError(t('auth.errPassword'));
    if (!accepted)             return setError(t('auth.errAccept'));
    setSending(true);
    try {
      const r = await fetch('/api/auth/signup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (r.status === 409) {
        setError(t('auth.errExists'));
        setSending(false);
        return;
      }
      if (r.status === 503) {
        setError(t('auth.errStorage'));
        setSending(false);
        return;
      }
      if (!r.ok) {
        let detail = '';
        try {
          const body = await r.json() as { detail?: string; error?: string };
          detail = body.detail || body.error || '';
        } catch { /* response may not be JSON */ }
        setError(`${t('auth.errSignup')} (${r.status})${detail ? `: ${detail}` : '.'}`);
        setSending(false);
        return;
      }
      // If the response carries `emailSent: false`, the account was
      // created but Firebase refused to ship the verification email —
      // surface the reason so the operator can fix the Firebase config
      // (most often: domain not in the Authorized list).
      try {
        const body = await r.json() as { emailSent?: boolean; emailError?: string };
        if (body.emailSent === false) {
          const hint = body.emailError === 'continue_url_unauthorised'
            ? ' Add the deploy domain to Firebase Console → Authentication → Settings → Authorized domains.'
            : '';
          setError(`Account created, but the verification email could not be sent (${body.emailError || 'unknown'}).${hint}`);
          setSending(false);
          return;
        }
      } catch { /* response wasn't JSON — fall through to redirect */ }
      // The account exists in Firebase Auth but is not signed in yet —
      // the user has to click the verification link Firebase emailed
      // before /api/auth/login will let them through. Park them on the
      // "check your inbox" page; the email is preserved so the resend
      // button on that page knows who to resend to.
      window.location.href = `/tv/check-email?email=${encodeURIComponent(email)}`;
      return;
    } catch (err) {
      setError(`${t('auth.errSignup')}: ${(err as Error).message}`);
    }
    setSending(false);
  }

  return (
    <main className="ah-root">
      <Link href="/" className="ah-topback">{t('auth.backHome')}</Link>

      <div className="ah-card">
        <div className="ah-wm">NOVA STREAM</div>
        <h1 className="ah-title">{t('auth.startWatching')}</h1>
        <p className="ah-sub">
          {t('auth.signupSub')}
        </p>

        <GoogleSection onSuccess={handleGoogle} onError={setError} dividerLabel={t('auth.orSignupEmail')} />

        <form onSubmit={submit}>
          <div className="ah-field">
            <label className="ah-label">{t('auth.email')}</label>
            <input
              className="ah-input"
              type="email"
              placeholder="you@example.com"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className="ah-field-help">
              {t('auth.activationHelp')}
            </div>
          </div>
          <div className="ah-field">
            <label className="ah-label">{t('auth.password')}</label>
            <input
              className="ah-input"
              type="password"
              placeholder={t('auth.passwordPh')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="ah-field-help">
              {t('auth.passwordHelp')}
            </div>
          </div>

          <label className="ah-check">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>
              {t('auth.agree1')}{locale === 'he' ? '' : ' '}<Link href="/legal/terms" className="ah-link">{t('auth.terms')}</Link>{' '}
              {t('auth.agree2')}{locale === 'he' ? '' : ' '}<Link href="/legal/privacy" className="ah-link">{t('auth.privacy')}</Link>
              {t('auth.agree3')}
            </span>
          </label>

          {error && <div className="ah-err">{error}</div>}

          <button type="submit" className="ah-btn" disabled={sending}>
            {sending ? t('auth.creating') : t('auth.createAccount')}
          </button>
        </form>

        <div className="ah-bottom">
          {t('auth.haveAccount')} <Link href="/tv/login" className="ah-link">{t('auth.signIn')}</Link>
        </div>
      </div>
    </main>
  );
}
