'use client';

// Sign-up screen. Email + password only — the activation link arrives by
// email, opens /tv/activate, which starts the 7-day trial.
//
// The backend isn't deployed in this demo build, so the submit handler
// validates locally and renders the "we sent you an email" state without
// a network call. Once auth-service is reachable it becomes
// fetch('/api/auth/register', { ... }).
import Link from 'next/link';
import { useState } from 'react';
import '../account/account.css';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(true);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.includes('@')) return setError('Please enter a valid email.');
    if (password.length < 10)  return setError('Password must be at least 10 characters.');
    if (!accepted)             return setError('You need to accept the Terms and Privacy policy.');
    setSent(true);
  }

  if (sent) {
    return (
      <main className="ac-auth">
        <div className="ac-auth-card">
          <div className="ac-auth-wm">NOVA STREAM</div>
          <h1 className="ac-auth-title">Check your inbox</h1>
          <p className="ac-auth-sub">
            We sent an activation link to <b>{email}</b>. Click it to start
            your 7-day free trial. The link is valid for 48 hours.
          </p>
          <p style={{ fontSize: 13, color: 'var(--ns-text-faint)', marginTop: 16 }}>
            Didn't get it? Check spam, or{' '}
            <button
              className="ac-auth-link"
              style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
              onClick={() => setSent(false)}
            >
              try a different email
            </button>.
          </p>
          <div className="ac-auth-bottom">
            Already activated? <Link href="/tv/login" className="ac-auth-link">Sign in</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="ac-auth">
      <div className="ac-auth-card">
        <div className="ac-auth-wm">NOVA STREAM</div>
        <h1 className="ac-auth-title">Start watching</h1>
        <p className="ac-auth-sub">
          7 days free. No card needed. One email per account.
        </p>

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
            <div className="ac-field-help">We'll send an activation link. Your trial starts when you click it.</div>
          </div>
          <div className="ac-field">
            <label className="ac-field-label">Password</label>
            <input
              className="ac-input"
              type="password"
              placeholder="At least 10 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="ac-field-help">Long passwords beat complex ones. We check against leaked databases.</div>
          </div>

          <div style={{
            fontSize: 12, color: 'var(--ns-text-faint)',
            padding: '12px 0', display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              style={{ marginTop: 4 }}
            />
            <div>
              I agree to the <Link href="/legal/terms" className="ac-auth-link">Terms</Link> and the{' '}
              <Link href="/legal/privacy" className="ac-auth-link">Privacy policy</Link>. You can delete your account at any time from Settings → Account.
            </div>
          </div>

          {error && (
            <div style={{
              color: 'var(--ns-danger, #FF6B7B)',
              fontSize: 13, padding: '8px 0',
            }}>{error}</div>
          )}

          <button
            type="submit"
            className="ac-btn ac-btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '16px' }}
          >
            Create account &amp; start trial
          </button>
        </form>

        <div className="ac-auth-bottom">
          Already have an account? <Link href="/tv/login" className="ac-auth-link">Sign in</Link>
        </div>
      </div>
    </main>
  );
}
