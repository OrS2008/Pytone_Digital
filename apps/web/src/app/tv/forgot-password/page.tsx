'use client';

// Forgot-password — step 1 of the email-driven password reset.
//
// Posts to /api/auth/forgot-password which generates a 30-minute reset
// token, stores it in KV, and emails the link via Brevo. The page
// always shows the "Check your inbox" confirmation regardless of
// whether the email exists in our database, so a curious visitor
// can't use this form to enumerate registered emails. The server
// returns the same body shape in both cases.

import { useState } from 'react';
import Link from 'next/link';
import '../auth/auth.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy]   = useState(false);
  const [sent, setSent]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.includes('@')) { setError('Please enter a valid email.'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (r.status === 503) {
        setError('Server storage is not configured yet. Ask the admin to bind NOVA_KV.');
        setBusy(false);
        return;
      }
      if (!r.ok) {
        setError(`Couldn’t send the reset email (${r.status}). Try again in a minute.`);
        setBusy(false);
        return;
      }
      setSent(true);
    } catch (err) {
      setError(`Network error: ${(err as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <main className="ah-root">
      <Link href="/tv/login" className="ah-topback">← Sign in</Link>

      <div className="ah-card">
        <div className="ah-wm">NOVA STREAM</div>

        {!sent ? (
          <>
            <h1 className="ah-title">Reset your password</h1>
            <p className="ah-sub">
              Enter the email on your account. We&apos;ll send a link that&apos;s
              valid for 30 minutes.
            </p>

            <form onSubmit={submit}>
              <div className="ah-field">
                <label className="ah-label">Email</label>
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
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="ah-title">Check your inbox</h1>
            <p className="ah-sub">
              If an account exists for <b>{email}</b>, a reset link is on its
              way. The link expires in 30 minutes. Check your spam folder if
              you don&apos;t see it within a minute or two.
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
              Send another
            </button>
          </>
        )}

        <div className="ah-bottom">
          Remembered it? <Link href="/tv/login" className="ah-link">Sign in</Link>
        </div>
      </div>
    </main>
  );
}
