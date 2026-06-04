'use client';

// Shared hook that fetches the signed-in user + their trial /
// subscription access state from /api/auth/me and surfaces it to any
// account screen that wants to display real data. Returns one of:
//
//   loading     — first paint, before the network call resolves.
//   anon        — no session cookie / cookie is stale.
//   error       — server is unreachable or returned 5xx.
//   trial       — has access via the 7-day free trial.
//   subscribed  — has access via a paid subscription.
//   expired     — neither; the trial gate should be blocking the UI.
//
// Centralised so TrialGate, AccountChip and AccountOverview agree on
// the same source of truth instead of each one inventing its own copy.

import { useEffect, useState } from 'react';

export type AccessStatus = 'loading' | 'anon' | 'error' | 'trial' | 'subscribed' | 'expired';

export interface AccessInfo {
  status:          AccessStatus;
  email?:          string;
  userId?:         string;
  createdAt?:      number;
  trialEndsAt?:    number;
  subscribedUntil?: number;
  daysLeft?:       number;
}

interface MeResponse {
  user?:   { userId: string; email: string; createdAt: number } | null;
  access?: { status: 'trial' | 'subscribed' | 'expired'; trialEndsAt: number; subscribedUntil: number; daysLeft: number };
}

export function useAccess(): AccessInfo {
  const [info, setInfo] = useState<AccessInfo>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
        if (cancelled) return;
        if (r.status === 401)      { setInfo({ status: 'anon' });   return; }
        if (!r.ok)                 { setInfo({ status: 'error' });  return; }
        const body = await r.json() as MeResponse;
        if (!body.user || !body.access) {
          setInfo({ status: 'error' });
          return;
        }
        setInfo({
          status:          body.access.status,
          email:           body.user.email,
          userId:          body.user.userId,
          createdAt:       body.user.createdAt,
          trialEndsAt:     body.access.trialEndsAt,
          subscribedUntil: body.access.subscribedUntil,
          daysLeft:        body.access.daysLeft,
        });
      } catch {
        if (!cancelled) setInfo({ status: 'error' });
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return info;
}
