'use client';

// Sign-in screen. Same demo-build caveat as signup: validates locally
// and routes the user to /tv on a successful local check. When the
// backend is reachable, the submit handler becomes a fetch against
// /api/auth/login and persists the returned refresh token.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { setSessionEmail } from '@/lib/session';
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
    setSessionEmail(email);
    // Simulate a small auth round-trip so the button has feedback.
    setTimeout(() => router.push('/tv'), 400);
  }

  return (
    <main className="ac-auth">
      <div className="ac-auth-card">
        <div className="ac-auth-wm">NOVA STREAM</div>
        <h1 className="ac-auth-title">Welcome back</h1>
        <p className="ac-auth-sub">Sign in to keep watching where you left off.</p>

        <form onSubmit={submit}>
          <div className="ac-field">
            <label className="ac-field-label">Email</label>
            <input
              className="ac-input"
              type="email"
              placeholder="you@example.com"
              autoFocus
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
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="ac-auth-bottom">
          New here? <Link href="/tv/signup" className="ac-auth-link">Create an account</Link> · 7 days free
        </div>
      </div>
    </main>
  );
}
