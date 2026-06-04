'use client';

// Trial-expiry full-screen gate.
//
// Mounted from the TV layout. On every boot we hit /api/auth/me and
// read the `access` object the server returns. Three states:
//
//   trial      — show a discrete banner with days left, do not block.
//   subscribed — render nothing.
//   expired    — overlay the entire player with a "Subscribe to keep
//                watching" screen that prevents interaction with /tv.
//                Settings → Account remains reachable through the
//                overlay so the user can still subscribe or sign out.
//
// We poll /api/auth/me again every 6 hours so a trial that expires
// while the tab is open transitions without a hard reload.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { signOut } from '@/lib/session';

type Status = 'unknown' | 'trial' | 'subscribed' | 'expired' | 'anon';

interface Access {
  status:          'trial' | 'subscribed' | 'expired';
  trialEndsAt:     number;
  subscribedUntil: number;
  daysLeft:        number;
}

const POLL_MS = 6 * 60 * 60 * 1000;

async function fetchAccess(): Promise<{ status: Status; access?: Access }> {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
    if (r.status === 401) return { status: 'anon' };
    if (!r.ok) return { status: 'unknown' };
    const body = await r.json() as { access?: Access };
    if (!body.access) return { status: 'unknown' };
    return { status: body.access.status, access: body.access };
  } catch {
    return { status: 'unknown' };
  }
}

export default function TrialGate() {
  const [status, setStatus] = useState<Status>('unknown');
  const [access, setAccess] = useState<Access | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const r = await fetchAccess();
      if (cancelled) return;
      setStatus(r.status);
      setAccess(r.access ?? null);
    }
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Anonymous and unknown states: render nothing. The unauthenticated
  // user still sees the player chrome — getting them off the page is
  // the welcome screen's job, not this component's.
  if (status === 'unknown' || status === 'anon' || status === 'subscribed') return null;

  if (status === 'trial') {
    const days = access?.daysLeft ?? 0;
    return (
      <div className="tg-banner" role="status">
        <span>
          {days <= 0
            ? 'Trial ends today.'
            : days === 1
              ? 'Trial ends tomorrow.'
              : `${days} days left in your free trial.`}
        </span>
        <Link href="/tv/account/plans" className="tg-banner-cta">Subscribe</Link>
      </div>
    );
  }

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
