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
import { useRouter } from 'next/navigation';
import { setSessionEmail, setActivated } from '@/lib/session';
import GoogleSection from '@/components/auth/GoogleSection';
import '../account/account.css';

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
        setError(`Sign-up failed (${r.status}).`);
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
    <main className="ac-auth">
      <div className="ac-auth-card">
        <div className="ac-auth-wm">NOVA STREAM</div>
        <h1 className="ac-auth-title">Start watching</h1>
        <p className="ac-auth-sub">
          7 days free. No card needed. One email per account.
        </p>

        <GoogleSection onSuccess={handleGoogle} onError={setError} dividerLabel="or sign up with email" />

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
              placeholder="At least 8 characters"
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
            disabled={sending}
            style={{ width: '100%', justifyContent: 'center', padding: '16px', opacity: sending ? 0.7 : 1 }}
          >
            {sending ? 'Sending confirmation…' : 'Create account & start trial'}
          </button>
        </form>

        <div className="ac-auth-bottom">
          Already have an account? <Link href="/tv/login" className="ac-auth-link">Sign in</Link>
        </div>
      </div>
    </main>
  );
}
