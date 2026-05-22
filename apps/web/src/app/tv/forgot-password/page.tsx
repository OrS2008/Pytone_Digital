'use client';

import { useState } from 'react';
import Link from 'next/link';
import '../account/account.css';

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes('@')) return;
    setSent(true);
  }

  return (
    <main className="ac-auth">
      <div className="ac-auth-card">
        <div className="ac-auth-wm">NOVA STREAM</div>

        {!sent ? (
          <>
            <h1 className="ac-auth-title">Reset your password</h1>
            <p className="ac-auth-sub">
              Enter the email on your account. We'll send a link that's valid for 30 minutes.
            </p>

            <form onSubmit={submit}>
              <div className="ac-field">
                <label className="ac-field-label">Email</label>
                <input
                  className="ac-input"
                  type="email"
                  autoFocus
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="ac-btn ac-btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: 16 }}
              >
                Send reset link
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="ac-auth-title">Check your inbox</h1>
            <p className="ac-auth-sub">
              If an account exists for <b>{email}</b>, a reset link has been sent. The
              link expires in 30 minutes. Check your spam folder if you don't see it.
            </p>
            <button
              className="ac-btn"
              style={{ width: '100%', justifyContent: 'center', padding: 14, marginTop: 8 }}
              onClick={() => { setSent(false); setEmail(''); }}
            >
              Send another
            </button>
          </>
        )}

        <div className="ac-auth-bottom">
          Remembered it? <Link href="/tv/login" className="ac-auth-link">Sign in</Link>
        </div>
      </div>
    </main>
  );
}
