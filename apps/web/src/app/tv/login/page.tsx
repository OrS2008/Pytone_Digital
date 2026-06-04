'use client';

// Sign-in screen. Two paths:
//   * Continue with Google — verified server-side at /api/auth/google,
//                            then setSessionEmail + redirect to /tv.
//   * Email + password — POSTs to /api/auth/login. On success the
//                        server sets an HTTP-only session cookie and
//                        we pull the user's settings down to seed
//                        this device's localStorage.

import Link from 'next/link';
import { useState } from 'react';
import { setSessionEmail, setActivated } from '@/lib/session';
import { syncDown } from '@/lib/serverSync';
import GoogleSection from '@/components/auth/GoogleSection';
import '../auth/auth.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      window.location.href = '/tv';
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
        <h1 className="ah-title">Welcome back</h1>
        <p className="ah-sub">Sign in to keep watching where you left off.</p>

        <GoogleSection onSuccess={handleGoogle} onError={setError} />

        <form onSubmit={submit}>
          <div className="ah-field">
            <label className="ah-label">Email</label>
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
              <label className="ah-label">Password</label>
              <Link href="/tv/forgot-password" className="ah-link" style={{ fontSize: 12 }}>Forgot?</Link>
            </div>
            <input
              className="ah-input"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <div className="ah-err">{error}</div>}

          <button type="submit" disabled={busy} className="ah-btn">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="ah-bottom">
          New here? <Link href="/tv/signup" className="ah-link">Create an account</Link> · 7 days free
        </div>
      </div>
    </main>
  );
}
