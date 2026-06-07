// Trial-expiry enforcement at the API layer.
//
// The TrialGate overlay in /tv blocks the player UI when a user's
// 7-day trial is over, but it can't stop someone from hitting the
// raw API routes directly with curl. requireActiveAccess() reads the
// session, loads the user record, and returns the AccessState — or a
// 402 / 401 / 503 Response the caller can early-return.
//
// 402 Payment Required: chosen over 403 because it's the canonical
// HTTP code for "this user identified themselves successfully but
// the resource is gated behind a paid plan." Clients can pattern
// match on it and route the user to /tv/account/plans.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireKV, type KVNamespace } from './cfEnv';
import { readSession, readSessionCookie } from './auth/serverSession';
import { accessState, findUserByEmail, type AccessState, type UserRecord } from './auth/users';

export interface AccessGuardOk {
  kv:      KVNamespace;
  user:    UserRecord;
  session: { userId: string; email: string };
  access:  AccessState;
}

// Returns the loaded user + access state when the user is signed in
// AND still has access (trial or subscription). Otherwise returns a
// Response the route can return directly.
export async function requireActiveAccess(req: NextRequest): Promise<AccessGuardOk | Response> {
  const kv = requireKV();
  if (kv instanceof Response) return kv;

  const sid = readSessionCookie(req);
  const session = sid ? await readSession(kv, sid) : null;
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const user = await findUserByEmail(kv, session.email);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const access = accessState(user);
  if (access.status === 'expired') {
    return NextResponse.json(
      {
        error: 'access_expired',
        message: 'Your free trial has ended. Subscribe to keep using Nova Stream.',
        access,
      },
      { status: 402 },
    );
  }

  return { kv, user, session, access };
}
