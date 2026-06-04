'use client';

// Trial-expiry full-screen gate.
//
// Mounted from the TV layout. On every boot we hit /api/auth/me and
// read the `access` status the server returns. We render exactly one
// thing and only one thing:
//
//   expired — overlay the entire player with a "Subscribe to keep
//             watching" screen that prevents interaction with /tv.
//             Settings → Account remains reachable through the
//             overlay so the user can still subscribe or sign out.
//
// trial / subscribed / anon / unknown — render nothing. The
// "X days left" countdown lives in the .ac-trial-pill in the
// account top-nav; we don't duplicate it as a floating banner over
// the player.
//
// We poll /api/auth/me again every 6 hours so a trial that expires
// while the tab is open transitions without a hard reload.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { signOut } from '@/lib/session';

type Status = 'unknown' | 'trial' | 'subscribed' | 'expired' | 'anon';

interface Access { status: 'trial' | 'subscribed' | 'expired' }

const POLL_MS = 6 * 60 * 60 * 1000;

async function fetchAccess(): Promise<Status> {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
    if (r.status === 401) return 'anon';
    if (!r.ok) return 'unknown';
    const body = await r.json() as { access?: Access };
    return body.access?.status ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export default function TrialGate() {
  const [status, setStatus] = useState<Status>('unknown');

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const next = await fetchAccess();
      if (!cancelled) setStatus(next);
    }
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (status !== 'expired') return null;
  // status === 'expired' — full-screen blocker.
  return (
    <div className="tg-overlay" role="dialog" aria-modal="true">
      <div className="tg-card">
        <div className="tg-eyebrow">Free trial ended</div>
        <h2 className="tg-title">Your 7 days are up</h2>
        <p className="tg-sub">
          Thanks for trying Nova Stream. Subscribe to keep streaming on
          every device — your playlist, history and preferences are
          waiting.
        </p>
        <div className="tg-actions">
          <Link href="/tv/account/plans" className="tg-btn tg-btn-primary">
            Choose a plan
          </Link>
          <button type="button" className="tg-btn tg-btn-ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
        <div className="tg-foot">
          Cancel any time · No long-term commitment
        </div>
      </div>
    </div>
  );
}
