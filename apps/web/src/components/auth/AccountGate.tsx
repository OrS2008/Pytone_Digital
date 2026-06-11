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
import { useT } from '@/lib/i18n';

type State = 'loading' | 'no-session' | 'unactivated' | 'ok';

export default function AccountGate({ children }: { children: ReactNode }) {
  const { t } = useT();
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
            <h1 className="ac-gate-title">{t('gate.signInTitle')}</h1>
            <p className="ac-gate-sub">{t('gate.signInSub')}</p>
            <div className="ac-gate-actions">
              <Link href="/tv/login"  className="ac-btn ac-btn-primary">{t('gate.signIn')}</Link>
              <Link href="/tv/signup" className="ac-btn">{t('gate.createAccount')}</Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="ac-gate-title">{t('gate.activateTitle')}</h1>
            <p className="ac-gate-sub">
              {t('gate.activateSubA')} <b>{email}</b>. {t('gate.activateSubB')}
            </p>
            <div className="ac-gate-actions">
              <Link href="/tv/activate" className="ac-btn ac-btn-primary">{t('gate.activateCta')}</Link>
              <Link href="/tv/signup"   className="ac-btn">{t('gate.differentEmail')}</Link>
            </div>
            <p className="ac-gate-hint">
              {t('gate.noEmail')}{' '}
              <Link href="/tv/signup" className="ac-auth-link">/tv/signup</Link>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
