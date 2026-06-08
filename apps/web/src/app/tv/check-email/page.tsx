'use client';

// /tv/check-email — "we sent you a verification link" landing page.
//
// Where the signup form sends the user after a successful signup. The
// account exists in Firebase Auth but cannot sign in until they click
// the link Firebase emailed. We surface the email address, a resend
// button (re-authenticates against Firebase first, so a stranger
// can't spam an inbox), and a "I've verified, sign in" CTA.

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import '../auth/auth.css';

function CheckEmailInner() {
  const params = useSearchParams();
  const email  = params.get('email') ?? '';
  const [password, setPassword] = useState('');
  const [sending,  setSending]  = useState(false);
  const [msg,      setMsg]      = useState<string | null>(null);
  const [err,      setErr]      = useState<string | null>(null);

  async function resend(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null);
    if (!email)            return setErr('Missing email — open the signup page again.');
    if (password.length < 8) return setErr('Enter the password you signed up with.');
    setSending(true);
    try {
      const r = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (r.status === 401) setErr('That password doesn\'t match — try again.');
      else if (!r.ok)       setErr(`Couldn't resend (${r.status}). Try again in a minute.`);
      else                  setMsg('Sent! Check your inbox (and spam folder).');
    } catch (e) {
      setErr(`Couldn\'t resend: ${(e as Error).message}`);
    } finally {
      setSending(false);
      setPassword('');
    }
  }

  return (
    <main className="ah-root">
      <Link href="/" className="ah-topback">← Home</Link>
      <div className="ah-card">
        <h1 className="ah-title">Check your inbox</h1>
        <p className="ah-sub" style={{ marginBottom: 18 }}>
          We sent a verification link to{' '}
          <strong style={{ color: '#fff' }}>{email || 'your email'}</strong>.
          Click the link, then come back here to sign in.
        </p>
        <p className="ah-sub" style={{ fontSize: 13, opacity: 0.75 }}>
          The link comes from <code>noreply@nova-stream-4ee03.firebaseapp.com</code> —
          check the spam folder if it&apos;s not in the inbox after a minute.
        </p>

        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '24px 0' }} />

        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#E9EBF1', margin: '0 0 10px' }}>
          Didn&apos;t get the email?
        </h2>
        <form onSubmit={resend}>
          <label className="ah-label">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Same password you just signed up with"
              className="ah-input"
            />
          </label>
          {err && <div className="ah-err" style={{ marginTop: 10 }}>{err}</div>}
          {msg && <div style={{ marginTop: 10, color: '#7DF9C6', fontSize: 13 }}>{msg}</div>}
          <button type="submit" disabled={sending} className="ah-btn" style={{ marginTop: 14 }}>
            {sending ? 'Sending…' : 'Resend verification email'}
          </button>
        </form>

        <p className="ah-sub" style={{ marginTop: 22, textAlign: 'center' }}>
          Already verified?{' '}
          <Link href="/tv/login" className="ah-link">Sign in →</Link>
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
