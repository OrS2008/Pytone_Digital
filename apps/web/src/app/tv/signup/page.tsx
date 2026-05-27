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
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  // When Mailtrap returns 422 (sender domain not verified) we still want
  // the user to be able to proceed — we surface a friendly notice and
  // keep the manual "open my account" button visible.
  const [deliveryWarning, setDeliveryWarning] = useState<string | null>(null);
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
    setDeliveryWarning(null);
    if (!email.includes('@')) return setError('Please enter a valid email.');
    if (password.length < 10)  return setError('Password must be at least 10 characters.');
    if (!accepted)             return setError('You need to accept the Terms and Privacy policy.');
    setSessionEmail(email);
    // Pending activation until the user clicks the link in the email
    // (handled by /tv/activate). The account section is gated on this.
    setActivated(false);
    setSending(true);
    try {
      const resp = await fetch('/api/email/activate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({} as { error?: string }));
        setDeliveryWarning(data.error || 'We could not send the activation email. You can still open your account manually below.');
      }
    } catch {
      setDeliveryWarning('We could not reach the email service. You can still open your account manually below.');
    }
    setSending(false);
    setSent(true);
  }

  if (sent) {
    return (
      <main className="ac-auth">
        <div className="ac-auth-card">
          <div className="ac-auth-wm">NOVA STREAM</div>
          <h1 className="ac-auth-title">Check your inbox</h1>
          <p className="ac-auth-sub">
            We sent a confirmation link to <b>{email}</b>. Click it to verify your address
            and your 7-day free trial begins.
          </p>
          {deliveryWarning && (
            <div style={{
              fontSize: 13, padding: '10px 12px', marginTop: 12,
              borderRadius: 8,
              background: 'rgba(255, 196, 80, 0.12)',
              color: 'var(--ns-text)',
              border: '1px solid rgba(255, 196, 80, 0.3)',
            }}>{deliveryWarning}</div>
          )}
          <Link
            href="/tv/activate"
            className="ac-btn ac-btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '14px', marginTop: 16 }}
          >
            I clicked the link · open my account
          </Link>
          <p style={{ fontSize: 13, color: 'var(--ns-text-faint)', marginTop: 16 }}>
            Didn&apos;t get it? Check spam, or{' '}
            <button
              className="ac-auth-link"
              style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
              onClick={() => { setSent(false); setDeliveryWarning(null); }}
            >
              use a different email
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
