'use client';

// /tv/auth-action — handler page for Firebase's "custom action URL".
//
// Two flows pass through here, picked by `mode` in the query string:
//
//   mode=verifyEmail   → POST /api/auth/verify-action
//                         server applies the oobCode → user verified →
//                         session cookie minted → redirect /tv.
//
//   mode=resetPassword → POST /api/auth/reset-action (step=verify) to
//                         confirm the link + read the email, render a
//                         styled "set new password" form, POST again
//                         (step=confirm) to commit + auto-sign-in,
//                         redirect /tv.
//
// In both cases the user never has to leave Nova Stream's UI — the
// Firebase-hosted default action page is replaced with our own.

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { setSessionEmail, setActivated } from '@/lib/session';
import { syncDown } from '@/lib/serverSync';
import '../auth/auth.css';

function AuthActionInner() {
  const params = useSearchParams();
  const mode    = (params.get('mode') ?? '').toLowerCase();
  const oobCode = params.get('oobCode') ?? '';

  // No oobCode = the user landed here via Firebase's default hosted
  // action page (custom action URL not configured), which already
  // applied the code on its end and then hit "Continue", forwarding
  // them to our continueUrl. In that case the email IS verified —
  // we just don't have a session yet. Bounce them to /tv/login with
  // the success banner so the next step is obvious.
  if (!oobCode) {
    return <NoCodeRedirect />;
  }
  if (mode === 'verifyemail' || mode === 'verify_email') {
    return <VerifyEmailFlow oobCode={oobCode} />;
  }
  if (mode === 'resetpassword' || mode === 'password_reset') {
    return <ResetPasswordFlow oobCode={oobCode} />;
  }
  return <UnsupportedCard />;
}

// Fallback path: Firebase's default action page consumed the oobCode
// on their end and bounced the user to our continueUrl with no
// credentials in the URL. The preverify HTTP-only cookie we set at
// signup is still attached though, so we can swap the refresh token
// inside it for an idToken, confirm Firebase now reports the address
// as verified, and mint a real session — giving the user the same
// "click → home" experience the custom action URL would.
function NoCodeRedirect() {
  const [state, setState] = useState<'working' | 'ok' | 'manual'>('working');
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/auth/post-verify', {
          method: 'POST',
          credentials: 'include',
        });
        if (r.ok) {
          const body = await r.json().catch(() => ({})) as {
            ok?: boolean; email?: string; redirectTo?: string;
          };
          if (body.ok) {
            if (body.email) { setSessionEmail(body.email); setActivated(true); }
            try { await syncDown(); } catch { /* ignore */ }
            setState('ok');
            setTimeout(() => { window.location.href = body.redirectTo || '/tv'; }, 600);
            return;
          }
        }
        // Cookie missing / refresh failed / still-unverified — fall
        // back to the manual sign-in screen with the verified banner
        // so the user always lands somewhere sensible.
        setState('manual');
        setTimeout(() => { window.location.href = '/tv/login?verified=1'; }, 1000);
      } catch {
        setState('manual');
        setTimeout(() => { window.location.href = '/tv/login?verified=1'; }, 1000);
      }
    })();
  }, []);
  return (
    <main className="ah-root">
      <div className="ah-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>✓</div>
        <h1 className="ah-title">Email verified</h1>
        <p className="ah-sub">
          {state === 'manual'
            ? 'Taking you to the sign-in screen…'
            : 'Signing you in — taking you to the home screen.'}
        </p>
      </div>
    </main>
  );
}

// --- mode=verifyEmail ---------------------------------------------------

function VerifyEmailFlow({ oobCode }: { oobCode: string }) {
  const [state, setState] = useState<'working' | 'ok' | 'error'>('working');
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/auth/verify-action', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'verifyEmail', oobCode }),
        });
        const body = await r.json().catch(() => ({})) as {
          ok?: boolean; email?: string; redirectTo?: string; detail?: string;
        };
        if (!r.ok || !body.ok) {
          setState('error');
          setDetail(body.detail || `Server returned ${r.status}.`);
          return;
        }
        if (body.email) { setSessionEmail(body.email); setActivated(true); }
        try { await syncDown(); } catch { /* ignore */ }
        setState('ok');
        setTimeout(() => { window.location.href = body.redirectTo || '/tv'; }, 600);
      } catch (e) {
        setState('error');
        setDetail((e as Error).message);
      }
    })();
  }, [oobCode]);

  if (state === 'working') {
    return <SimpleCard title="Verifying your email…" sub="Hang on a second." />;
  }
  if (state === 'ok') {
    return (
      <main className="ah-root">
        <div className="ah-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>✓</div>
          <h1 className="ah-title">Email verified</h1>
          <p className="ah-sub">Signing you in — taking you to the home screen.</p>
        </div>
      </main>
    );
  }
  return <ErrorCard message={detail ?? 'The link may be expired or already used.'} resend />;
}

// --- mode=resetPassword -------------------------------------------------

function ResetPasswordFlow({ oobCode }: { oobCode: string }) {
  const [phase,    setPhase]    = useState<'verifying' | 'form' | 'saving' | 'done' | 'error'>('verifying');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [err,      setErr]      = useState<string | null>(null);

  // Step 1 — verify the code, fetch the email it belongs to.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/auth/reset-action', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ step: 'verify', oobCode }),
        });
        const body = await r.json().catch(() => ({})) as { ok?: boolean; email?: string; detail?: string };
        if (!r.ok || !body.ok) {
          setPhase('error');
          setErr(body.detail || `Link rejected (${r.status}).`);
          return;
        }
        setEmail(body.email || '');
        setPhase('form');
      } catch (e) {
        setPhase('error'); setErr((e as Error).message);
      }
    })();
  }, [oobCode]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password.length < 8)        return setErr('Password must be at least 8 characters.');
    if (password !== confirm)       return setErr('The two passwords don\'t match.');
    setPhase('saving');
    try {
      const r = await fetch('/api/auth/reset-action', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ step: 'confirm', oobCode, newPassword: password }),
      });
      const body = await r.json().catch(() => ({})) as {
        ok?: boolean; email?: string; redirectTo?: string; detail?: string;
      };
      if (!r.ok || !body.ok) {
        setPhase('form');
        setErr(body.detail || `Couldn't save (${r.status}). The link may have expired.`);
        return;
      }
      if (body.email) { setSessionEmail(body.email); setActivated(true); }
      try { await syncDown(); } catch { /* ignore */ }
      setPhase('done');
      setTimeout(() => { window.location.href = body.redirectTo || '/tv'; }, 700);
    } catch (e) {
      setPhase('form'); setErr((e as Error).message);
    }
  }

  if (phase === 'verifying') return <SimpleCard title="Checking your reset link…" sub="Just a second." />;
  if (phase === 'error')     return <ErrorCard message={err ?? 'This link is no longer valid.'} resend />;
  if (phase === 'done') {
    return (
      <main className="ah-root">
        <div className="ah-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>✓</div>
          <h1 className="ah-title">Password updated</h1>
          <p className="ah-sub">Signing you in — taking you to the home screen.</p>
        </div>
      </main>
    );
  }
  return (
    <main className="ah-root">
      <Link href="/" className="ah-topback">← Home</Link>
      <div className="ah-card">
        <div className="ah-wm">NOVA STREAM</div>
        <h1 className="ah-title">Set a new password</h1>
        <p className="ah-sub">
          For <strong style={{ color: '#fff' }}>{email || 'your account'}</strong>.
          You&apos;ll be signed in automatically once you save.
        </p>

        <form onSubmit={save} style={{ marginTop: 12 }}>
          <div className="ah-field">
            <label className="ah-label">New password</label>
            <input
              className="ah-input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoFocus
            />
          </div>
          <div className="ah-field">
            <label className="ah-label">Confirm new password</label>
            <input
              className="ah-input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Type it again"
            />
          </div>
          {err && <div className="ah-err">{err}</div>}
          <button
            type="submit"
            disabled={phase === 'saving'}
            className="ah-btn"
            style={{ marginTop: 8 }}
          >
            {phase === 'saving' ? 'Saving…' : 'Save and sign in'}
          </button>
        </form>

        <p className="ah-sub" style={{ marginTop: 18, textAlign: 'center' }}>
          Changed your mind?{' '}
          <Link href="/tv/login" className="ah-link">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}

// --- shared cards -------------------------------------------------------

function SimpleCard({ title, sub }: { title: string; sub: string }) {
  return (
    <main className="ah-root">
      <div className="ah-card" style={{ textAlign: 'center' }}>
        <h1 className="ah-title">{title}</h1>
        <p className="ah-sub">{sub}</p>
      </div>
    </main>
  );
}

function ErrorCard({ message, resend = false }: { message: string; resend?: boolean }) {
  return (
    <main className="ah-root">
      <div className="ah-card" style={{ textAlign: 'center' }}>
        <h1 className="ah-title">This link is no longer valid</h1>
        <p className="ah-sub">{message}</p>
        {resend && (
          <p className="ah-sub" style={{ marginTop: 14 }}>
            <Link href="/tv/forgot-password" className="ah-link">Request a fresh link →</Link>
          </p>
        )}
        <p className="ah-sub" style={{ marginTop: 14 }}>
          <Link href="/tv/login" className="ah-link">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}

function UnsupportedCard() {
  return (
    <main className="ah-root">
      <div className="ah-card" style={{ textAlign: 'center' }}>
        <h1 className="ah-title">That link isn&apos;t the one we&apos;re looking for</h1>
        <p className="ah-sub">
          Open the most recent verification or reset email and try again, or{' '}
          <Link href="/tv/login" className="ah-link">sign in →</Link>
        </p>
      </div>
    </main>
  );
}

export default function AuthActionPage() {
  return (
    <Suspense fallback={<main className="ah-root"><div className="ah-card">Loading…</div></main>}>
      <AuthActionInner />
    </Suspense>
  );
}
