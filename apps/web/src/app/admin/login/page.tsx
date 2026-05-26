'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// Validate the ?next= redirect target against an allow-list of safe
// shapes. Without this, ?next=https://attacker.tld would let a
// phishing site forward an authenticated admin off the property.
// The only legitimate destinations are paths under /admin.
function safeNext(raw: string | null): string {
  const FALLBACK = '/admin/dashboard';
  if (!raw) return FALLBACK;
  // Reject any absolute URL or protocol-relative URL.
  if (!raw.startsWith('/') || raw.startsWith('//')) return FALLBACK;
  // Reject backslash tricks that some browsers normalise to '/'.
  if (raw.includes('\\')) return FALLBACK;
  // Only allow /admin and /admin/* — nothing else.
  if (raw !== '/admin' && !raw.startsWith('/admin/')) return FALLBACK;
  return raw;
}

function LoginInner() {
  const params = useSearchParams();
  const next   = safeNext(params.get('next'));
  const initialError = params.get('e') === 'unavailable' ? 'Admin is unavailable right now.' : null;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState<string | null>(initialError);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      const r = await fetch('/api/admin/login', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ username, password }),
      });
      if (r.ok) {
        // Hard navigation so the middleware re-evaluates the request
        // with the freshly-set cookie attached. router.replace uses
        // client-side prefetched RSC payloads that don't always pick
        // the new cookie up on the first hop.
        window.location.href = next;
        return;
      }
      const data = await r.json().catch(() => ({} as { error?: string }));
      setError(data.error || 'Sign in failed.');
    } catch {
      setError('Network error.');
    } finally { setBusy(false); }
  }

  return (
    <div className="adm-login">
      <form className="adm-login-card" onSubmit={submit}>
        <div className="adm-eyebrow">Nova Stream</div>
        <h1 className="adm-title">Admin sign in</h1>
        <p className="adm-sub">Authorised personnel only.</p>

        {error && <div className="adm-err">{error}</div>}

        <div className="adm-field">
          <label className="adm-label">Username</label>
          <input
            className="adm-input"
            type="email"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="adm-field">
          <label className="adm-label">Password</label>
          <input
            className="adm-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button type="submit" disabled={busy} className="adm-btn">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

export default function AdminLogin() {
  return (
    <Suspense fallback={<div className="adm-login"><div className="adm-login-card"><div className="adm-eyebrow">Nova Stream</div><h1 className="adm-title">Admin sign in</h1></div></div>}>
      <LoginInner />
    </Suspense>
  );
}
