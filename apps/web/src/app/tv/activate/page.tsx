'use client';

// /tv/activate
//
// Email activation endpoint. In production the user lands here from
// the link in their activation email — the link looks like
// /tv/activate?token=<single-use-peppered-token>. The auth-service
// validates the token, flips users.email_verified_at, and returns 200.
//
// In this frontend-only build we don't have an auth backend, so the
// page simulates the call: any visit flips the local `activated` flag
// to true and redirects into the app. The intent is preserved — only
// the user who set up the email + actually got the link (or who is
// already signed in) can reach this page.

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getSessionEmail, setActivated } from '@/lib/session';
import '../account/account.css';

// useSearchParams forces this subtree to render on the client, which
// means Next.js's static-export step has to bail out — and on Next 15
// the bail-out requires a Suspense boundary so the surrounding page
// shell can still be statically generated. The outer export below
// satisfies that requirement; the inner component does the actual work.
function ActivateInner() {
  const router = useRouter();
  const params = useSearchParams();
  const ranRef = useRef(false);
  const [state, setState] = useState<'working' | 'no-session' | 'done'>('working');

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const email = getSessionEmail();
    if (!email) { setState('no-session'); return; }

    void params.get('token'); // checked server-side in the real build
    setActivated(true);
    setState('done');
    const t = setTimeout(() => router.replace('/tv/account'), 1200);
    return () => clearTimeout(t);
  }, [params, router]);

  return (
    <div className="ac-auth-card">
      <div className="ac-auth-wm">NOVA STREAM</div>
      {state === 'working' && (
        <>
          <h1 className="ac-auth-title">Activating…</h1>
          <p className="ac-auth-sub">One moment while we confirm your email.</p>
        </>
      )}
      {state === 'no-session' && (
        <>
          <h1 className="ac-auth-title">Sign in to finish activation</h1>
          <p className="ac-auth-sub">
            We need to know which account this activation link belongs to.
          </p>
          <div className="ac-gate-actions" style={{ marginTop: 14 }}>
            <Link href="/tv/login"  className="ac-btn ac-btn-primary">Sign in</Link>
            <Link href="/tv/signup" className="ac-btn">Sign up</Link>
          </div>
        </>
      )}
      {state === 'done' && (
        <>
          <h1 className="ac-auth-title">Account activated ✓</h1>
          <p className="ac-auth-sub">
            Your 7-day trial is on. Opening your account…
          </p>
        </>
      )}
    </div>
  );
}

export default function Activate() {
  return (
    <main className="ac-auth">
      <Suspense fallback={<div className="ac-auth-card"><div className="ac-auth-wm">NOVA STREAM</div><h1 className="ac-auth-title">Activating…</h1></div>}>
        <ActivateInner />
      </Suspense>
    </main>
  );
}
