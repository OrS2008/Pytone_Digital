'use client';

// Wraps every /tv/account/* page so that anyone who isn't both
// signed-in AND activated sees a "verify your email" wall instead of
// the page content. The hard requirement: an unactivated user cannot
// touch any account screen — billing, sources, devices, security, etc.
//
// Reads session state on mount only; signOut() reloads the document so
// the gate is re-evaluated naturally.

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { getSessionEmail, isActivated } from '@/lib/session';

type State = 'loading' | 'no-session' | 'unactivated' | 'ok';

export default function AccountGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>('loading');
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const e = getSessionEmail();
    setEmail(e);
    if (!e)              setState('no-session');
    else if (!isActivated()) setState('unactivated');
    else                 setState('ok');
  }, []);

  // Don't flash the gated content on the first paint while we read
  // localStorage — render nothing until the state resolves.
  if (state === 'loading') return null;
  if (state === 'ok')      return <>{children}</>;

  return (
    <div className="ac-gate">
      <div className="ac-gate-card">
        <div className="ac-gate-icon">✉</div>
        {state === 'no-session' ? (
          <>
            <h1 className="ac-gate-title">Sign in to access your account</h1>
            <p className="ac-gate-sub">
              Your subscription, devices, playlists and preferences live behind sign-in.
              It only takes a moment.
            </p>
            <div className="ac-gate-actions">
              <Link href="/tv/login"  className="ac-btn ac-btn-primary">Sign in</Link>
              <Link href="/tv/signup" className="ac-btn">Create an account</Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="ac-gate-title">Activate your account first</h1>
            <p className="ac-gate-sub">
              We sent an activation link to <b>{email}</b>. Click it to verify your email,
              then your account opens.
            </p>
            <div className="ac-gate-actions">
              <Link href="/tv/activate" className="ac-btn ac-btn-primary">I clicked the link · open my account</Link>
              <Link href="/tv/signup"   className="ac-btn">Use a different email</Link>
            </div>
            <p className="ac-gate-hint">
              Didn&apos;t get the email? Check spam, or sign up again from{' '}
              <Link href="/tv/signup" className="ac-auth-link">/tv/signup</Link>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
