'use client';

// Sign-in screen. Two paths:
//   * Continue with Google — verified server-side at /api/auth/google,
//                            then setSessionEmail + redirect to /tv.
//   * Email + password — POSTs to /api/auth/login. On success the
//                        server sets an HTTP-only session cookie and
//                        we pull the user's settings down to seed
//                        this device's localStorage.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { setSessionEmail, setActivated } from '@/lib/session';
import { syncDown } from '@/lib/serverSync';
import GoogleSection from '@/components/auth/GoogleSection';
import { useT } from '@/lib/i18n';
import '../auth/auth.css';

export default function Login() {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifiedBanner, setVerifiedBanner] = useState(false);
  const [busy, setBusy] = useState(false);

  // Firebase's verification action redirects back to /tv/login?verified=1
  // (we set this as `continueUrl` when triggering sendOobCode at signup).
  // Show a one-line confirmation so the user knows the click landed.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('verified') === '1') {
      setVerifiedBanner(true);
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.includes('@'))   return setError('Please enter a valid email.');
    if (password.length < 8)    return setError('Password must be at least 8 characters.');
    setBusy(true);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (r.status === 401) {
        setError('Wrong email or password.');
        setBusy(false);
        return;
      }
      if (r.status === 403) {
        // The credentials are valid but the user hasn't clicked the
        // Firebase verification link yet. Park them on the
        // check-email page; it has a "resend" button wired up.
        window.location.href = `/tv/check-email?email=${encodeURIComponent(email)}`;
        return;
      }
      if (r.status === 503) {
        setError('Server storage is not configured yet. Ask the admin to bind the NOVA_KV namespace.');
        setBusy(false);
        return;
      }
      if (!r.ok) {
        setError(`Sign-in failed (${r.status}).`);
        setBusy(false);
        return;
      }
      setSessionEmail(email);
      setActivated(true);
      await syncDown();
      window.location.href = '/tv/home';
    } catch (err) {
      setError(`Sign-in failed: ${(err as Error).message}`);
      setBusy(false);
    }
  }

  function handleGoogle(user: { email: string; name?: string | null; picture?: string | null }) {
    setError(null);
    setSessionEmail(user.email);
    setActivated(true);
    try {
      if (user.name)    localStorage.setItem('ns.session.name',    user.name);
      if (user.picture) localStorage.setItem('ns.session.picture', user.picture);
    } catch { /* ignore */ }
    window.location.href = '/tv';
  }

  return (
    <main className="ah-root">
      <Link href="/" className="ah-topback">← Home</Link>

      <div className="ah-card">
        <div className="ah-wm">NOVA STREAM</div>
        <h1 className="ah-title">{t('auth.welcomeBack')}</h1>
        <p className="ah-sub">{t('auth.signInSub')}</p>

        {verifiedBanner && (
          <div style={{
            margin: '12px 0',
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(125,249,198,0.08)',
            border: '1px solid rgba(125,249,198,0.25)',
            color: '#7DF9C6',
            fontSize: 13,
          }}>
            ✓ Email verified — sign in to continue.
          </div>
        )}

        <GoogleSection onSuccess={handleGoogle} onError={setError} />

        <form onSubmit={submit}>
          <div className="ah-field">
            <label className="ah-label">{t('auth.email')}</label>
            <input
              className="ah-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="ah-field">
            <div className="ah-row">
              <label className="ah-label">{t('auth.password')}</label>
              <Link href="/tv/forgot-password" className="ah-link" style={{ fontSize: 12 }}>{t('auth.forgot')}</Link>
            </div>
            <input
              className="ah-input"
              type="password"
              placeholder={t('auth.passwordPh')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <div className="ah-err">{error}</div>}

          <button type="submit" disabled={busy} className="ah-btn">
            {busy ? t('auth.signingIn') : t('auth.signIn')}
          </button>
        </form>

        <div className="ah-bottom">
          {t('auth.newHere')} <Link href="/tv/signup" className="ah-link">{t('gate.createAccount')}</Link> · {t('auth.freeTrial')}
        </div>
      </div>
    </main>
  );
}
