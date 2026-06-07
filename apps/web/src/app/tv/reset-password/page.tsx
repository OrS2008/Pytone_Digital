'use client';

// Reset-password — step 2 of the email-driven password reset.
//
// The user arrives here from the link in the email at
// /tv/reset-password?token=<TOKEN>. We don't validate the token until
// submit (no point burning a roundtrip on every page load); the
// server returns 404 on a bad / expired token and we surface that to
// the user with a "request a new link" prompt.

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import '../auth/auth.css';

function ResetInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token  = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [done,     setDone]     = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token)                return setError('Missing reset token. Open the link from your email again.');
    if (password.length < 8)   return setError('Password must be at least 8 characters.');
    if (password !== confirm)  return setError('Passwords don\'t match.');

    setBusy(true);
    try {
      const r = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (r.status === 404) {
        setError('This reset link is invalid or has expired. Request a new one from the Forgot password screen.');
        setBusy(false);
        return;
      }
      if (r.status === 422) {
        setError('Password is too weak (8+ characters).');
        setBusy(false);
        return;
      }
      if (r.status === 503) {
        setError('Server storage is not configured yet. Ask the admin to bind NOVA_KV.');
        setBusy(false);
        return;
      }
      if (!r.ok) {
        setError(`Password reset failed (${r.status}).`);
        setBusy(false);
        return;
      }
      setDone(true);
      setTimeout(() => router.replace('/tv/login'), 1800);
    } catch (err) {
      setError(`Network error: ${(err as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="ah-card">
      <div className="ah-wm">NOVA STREAM</div>

      {!done ? (
        <>
          <h1 className="ah-title">Set a new password</h1>
          <p className="ah-sub">
            Pick something you don&apos;t use anywhere else. 8+ characters,
            mixed case and digits beat &quot;P@ssw0rd!&quot;.
          </p>

          <form onSubmit={submit}>
            <div className="ah-field">
              <label className="ah-label">New password</label>
              <input
                className="ah-input"
                type="password"
                autoFocus
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="ah-field">
              <label className="ah-label">Confirm password</label>
              <input
                className="ah-input"
                type="password"
                placeholder="Re-type the new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            {error && <div className="ah-err">{error}</div>}

            <button type="submit" className="ah-btn" disabled={busy}>
              {busy ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </>
      ) : (
        <>
          <h1 className="ah-title">Password updated</h1>
          <p className="ah-sub">
            You can now sign in with your new password. Redirecting you to
            the sign-in screen…
          </p>
        </>
      )}

      <div className="ah-bottom">
        <Link href="/tv/login" className="ah-link">Back to sign in</Link>
      </div>
    </div>
  );
}

export default function ResetPassword() {
  return (
    <main className="ah-root">
      <Link href="/tv/login" className="ah-topback">← Sign in</Link>
      <Suspense fallback={
        <div className="ah-card">
          <div className="ah-wm">NOVA STREAM</div>
          <h1 className="ah-title">Loading…</h1>
        </div>
      }>
        <ResetInner />
      </Suspense>
    </main>
  );
}
