'use client';

// Sign-in screen. Two paths:
//   * Continue with Google — verified server-side at /api/auth/google,
//                            then setSessionEmail + redirect to /tv.
//   * Email + password — currently local-only; becomes a fetch against
//                        services/auth once that backend is deployed.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { setSessionEmail, setActivated } from '@/lib/session';
import GoogleButton from '@/components/auth/GoogleButton';
import '../account/account.css';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.includes('@')) return setError('Please enter a valid email.');
    if (password.length < 10)  return setError('Password must be at least 10 characters.');
    setBusy(true);
    // Anyone signing back in is, by definition, returning — their
    // account was activated on the original signup.
    setSessionEmail(email);
    setActivated(true);
    setTimeout(() => router.push('/tv'), 400);
  }

  function handleGoogle(user: { email: string; name?: string | null; picture?: string | null }) {
    setError(null);
    setSessionEmail(user.email);
    // Google has already confirmed the email — skip activation.
    setActivated(true);
    try {
      if (user.name)    localStorage.setItem('ns.session.name',    user.name);
      if (user.picture) localStorage.setItem('ns.session.picture', user.picture);
    } catch { /* ignore */ }
    router.push('/tv');
  }

  return (
    <main className="ac-auth">
      <div className="ac-auth-card">
        <div className="ac-auth-wm">NOVA STREAM</div>
        <h1 className="ac-auth-title">Welcome back</h1>
        <p className="ac-auth-sub">Sign in to keep watching where you left off.</p>

        <div style={{ margin: '20px 0 8px' }}>
          <GoogleButton onSuccess={handleGoogle} onError={setError} />
        </div>

        <div className="ac-auth-divider">
          <span>or</span>
        </div>

        <form onSubmit={submit}>
          <div className="ac-field">
            <label className="ac-field-label">Email</label>
            <input
              className="ac-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="ac-field">
            <label className="ac-field-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Password</span>
              <Link href="/tv/forgot-password" className="ac-auth-link" style={{ fontSize: 12 }}>Forgot?</Link>
            </label>
            <input
              className="ac-input"
              type="password"
              placeholder="At least 10 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div style={{
              color: 'var(--ns-danger, #FF6B7B)',
              fontSize: 13, padding: '8px 0',
            }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="ac-btn ac-btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '16px', opacity: busy ? 0.7 : 1 }}
          >
            {busy ? 'Signing in…' : 'Sign in with email'}
          </button>
        </form>

        <div className="ac-auth-bottom">
          New here? <Link href="/tv/signup" className="ac-auth-link">Create an account</Link> · 7 days free
        </div>
      </div>
    </main>
  );
}
