'use client';

// /tv/auth-action — handler page for Firebase's "custom action URL".
//
// The email link Firebase sends looks like:
//   https://<domain>/tv/auth-action?mode=verifyEmail&oobCode=XXX
//                                  &apiKey=YYY&continueUrl=ZZZ&lang=en
//
// We pull `mode` + `oobCode` out of the query string and POST them to
// /api/auth/verify-action. The server hands the oobCode to Firebase
// (single-use proof of inbox ownership), mints a session cookie, and
// tells us where to land — currently always `/tv`.
//
// No password prompt anywhere on the page: clicking the link is the
// whole auth flow. The user comes back to the Home screen signed in.

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { setSessionEmail, setActivated } from '@/lib/session';
import { syncDown } from '@/lib/serverSync';
import '../auth/auth.css';

function AuthActionInner() {
  const params = useSearchParams();
  const mode    = params.get('mode')    ?? '';
  const oobCode = params.get('oobCode') ?? '';
  const [state, setState] = useState<'working' | 'ok' | 'error' | 'unsupported'>('working');
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  useEffect(() => {
    if (!oobCode) { setState('error'); setErrorDetail('Missing oobCode in the URL.'); return; }

    // Password reset still goes through Firebase's own hosted page in
    // this build — the email link for that mode is generated with
    // Firebase's default action URL. Anything other than verifyEmail
    // means the user opened a stale / malformed link and we send them
    // back to /tv/login.
    if (mode !== 'verifyEmail' && mode !== 'VERIFY_EMAIL') {
      setState('unsupported');
      return;
    }

    (async () => {
      try {
        const r = await fetch('/api/auth/verify-action', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode, oobCode }),
        });
        const body = await r.json().catch(() => ({})) as {
          ok?: boolean; email?: string; redirectTo?: string; detail?: string;
        };
        if (!r.ok || !body.ok) {
          setState('error');
          setErrorDetail(body.detail || `Server returned ${r.status}.`);
          return;
        }

        // The server cookie is the source of truth, but mirror the
        // email into localStorage so the TV shell renders the right
        // initials / continues syncing on first paint.
        if (body.email) {
          setSessionEmail(body.email);
          setActivated(true);
        }
        try { await syncDown(); } catch { /* settings will pull on next render */ }

        setState('ok');
        // Give the user ~600 ms to see the confirmation before the
        // redirect snaps them to the home screen.
        setTimeout(() => {
          window.location.href = body.redirectTo || '/tv';
        }, 600);
      } catch (e) {
        setState('error');
        setErrorDetail((e as Error).message);
      }
    })();
  }, [mode, oobCode]);

  return (
    <main className="ah-root">
      <div className="ah-card" style={{ textAlign: 'center' }}>
        {state === 'working' && (
          <>
            <h1 className="ah-title">Verifying your email…</h1>
            <p className="ah-sub">Hang on a second.</p>
          </>
        )}
        {state === 'ok' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 8 }}>✓</div>
            <h1 className="ah-title">Email verified</h1>
            <p className="ah-sub">Signing you in — taking you to the home screen.</p>
          </>
        )}
        {state === 'unsupported' && (
          <>
            <h1 className="ah-title">That link isn&apos;t the one we&apos;re looking for</h1>
            <p className="ah-sub">
              Open the most recent verification email and try again, or{' '}
              <Link href="/tv/login" className="ah-link">sign in →</Link>
            </p>
          </>
        )}
        {state === 'error' && (
          <>
            <h1 className="ah-title">Couldn&apos;t verify this link</h1>
            <p className="ah-sub">
              {errorDetail || 'The link may be expired or already used.'}
            </p>
            <p className="ah-sub" style={{ marginTop: 12 }}>
              <Link href="/tv/check-email" className="ah-link">Send a new verification email →</Link>
            </p>
          </>
        )}
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
