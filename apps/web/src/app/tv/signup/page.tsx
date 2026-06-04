'use client';

// Sign-up screen. Email + password; account is usable immediately
// (the optional activation email is fire-and-forget). The 7-day trial
// starts at the moment of signup — see lib/auth/users.ts createUser
// which stamps trialStartedAt on the KV record.

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setSessionEmail, setActivated } from '@/lib/session';
import GoogleSection from '@/components/auth/GoogleSection';
import '../auth/auth.css';

export default function Signup() {
  const router = useRouter();
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
    router.push('/tv');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.includes('@')) return setError('Please enter a valid email.');
    if (password.length < 8)   return setError('Password must be at least 8 characters.');
    if (!accepted)             return setError('You need to accept the Terms and Privacy policy.');
    setSending(true);
    try {
      const r = await fetch('/api/auth/signup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (r.status === 409) {
        setError('That email is already registered. Try signing in instead.');
        setSending(false);
        return;
      }
      if (r.status === 503) {
        setError('Server storage is not configured yet. Ask the admin to bind the NOVA_KV namespace.');
        setSending(false);
        return;
      }
      if (!r.ok) {
        let detail = '';
        try {
          const body = await r.json() as { detail?: string; error?: string };
          detail = body.detail || body.error || '';
        } catch { /* response may not be JSON */ }
        setError(`Sign-up failed (${r.status})${detail ? `: ${detail}` : '.'}`);
        setSending(false);
        return;
      }
      setSessionEmail(email);
      setActivated(true);
      // Fire-and-forget activation email; account is usable immediately.
      fetch('/api/email/activate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      }).catch(() => { /* delivery is best-effort */ });
      window.location.href = '/tv';
      return;
    } catch (err) {
      setError(`Sign-up failed: ${(err as Error).message}`);
    }
    setSending(false);
  }

  return (
    <main className="ah-root">
      <Link href="/" className="ah-topback">← Home</Link>

      <div className="ah-card">
        <div className="ah-wm">NOVA STREAM</div>
        <h1 className="ah-title">Start watching</h1>
        <p className="ah-sub">
          7 days free. No card needed. One email per account.
        </p>

        <GoogleSection onSuccess={handleGoogle} onError={setError} dividerLabel="or sign up with email" />

        <form onSubmit={submit}>
          <div className="ah-field">
            <label className="ah-label">Email</label>
            <input
              className="ah-input"
              type="email"
              placeholder="you@example.com"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className="ah-field-help">
              We&apos;ll send an activation link. Your trial starts when you click it.
            </div>
          </div>
          <div className="ah-field">
            <label className="ah-label">Password</label>
            <input
              className="ah-input"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="ah-field-help">
              Long passwords beat complex ones. We check against leaked databases.
            </div>
          </div>

          <label className="ah-check">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>
              I agree to the <Link href="/legal/terms" className="ah-link">Terms</Link> and the{' '}
              <Link href="/legal/privacy" className="ah-link">Privacy policy</Link>. You can
              delete your account at any time from Settings → Help &amp; legal.
            </span>
          </label>

          {error && <div className="ah-err">{error}</div>}

          <button type="submit" className="ah-btn" disabled={sending}>
            {sending ? 'Creating account…' : 'Create account & start trial'}
          </button>
        </form>

        <div className="ah-bottom">
          Already have an account? <Link href="/tv/login" className="ah-link">Sign in</Link>
        </div>
      </div>
    </main>
  );
}
