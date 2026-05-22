'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next   = params.get('next') || '/admin/dashboard';
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
        router.replace(next);
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
