// POST /api/auth/change-password
//
// Authenticated. Verifies the user's current password against Firebase
// Authentication (the source of truth for credentials), then updates
// the Firebase Auth password. Our KV record holds no hash any more.
//
// Body:   { currentPassword: string, newPassword: string }
// Errors: 400 bad request, 401 not signed in / wrong current password,
//         422 weak new password, 503 KV / Firebase not configured.

import { NextRequest, NextResponse } from 'next/server';
import { requireKV } from '@/lib/cfEnv';
import { readSession, readSessionCookie, listSessionsForUser, destroySession } from '@/lib/auth/serverSession';
import {
  firebaseSignin,
  firebaseChangePassword,
  FirebaseAuthError,
  FirebaseNotConfiguredError,
} from '@/lib/firebaseAuth';

import { rateLimit, tooManyRequests } from '@/lib/rateLimit';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const kv = requireKV();
  if (kv instanceof Response) return kv;

  const sid = readSessionCookie(req);
  const session = sid ? await readSession(kv, sid) : null;
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // This route checks currentPassword, which makes it a password
  // oracle: whoever holds a session can otherwise brute-force the
  // account password here at full speed and escalate a borrowed
  // session into a full takeover. Keyed by account rather than IP so
  // the budget follows the target, not the attacker's address.
  {
    const rl = await rateLimit(kv, 'change-pw', session.userId, 10, 900);
    if (!rl.ok) return tooManyRequests(rl.retryAfter);
  }

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }

  const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const next    = typeof body.newPassword     === 'string' ? body.newPassword     : '';
  if (!current || !next)   return NextResponse.json({ error: 'bad_request' },   { status: 400 });
  if (next.length < 8)     return NextResponse.json({ error: 'weak_password' }, { status: 422 });
  if (next === current)    return NextResponse.json({ error: 'same_password' }, { status: 422 });

  // Re-authenticate first — that returns a fresh idToken we can use to
  // authorise the password update. Doing a full signin (rather than
  // exchanging the refresh token) is cheap and avoids us storing the
  // refresh token at all.
  let idToken: string;
  try {
    const fb = await firebaseSignin(session.email, current);
    idToken = fb.idToken;
  } catch (e) {
    if (e instanceof FirebaseNotConfiguredError) {
      return NextResponse.json({ error: 'auth_unconfigured' }, { status: 503 });
    }
    if (e instanceof FirebaseAuthError) {
      return NextResponse.json({ error: 'wrong_password' }, { status: 401 });
    }
    throw e;
  }

  try {
    await firebaseChangePassword(idToken, next);
  } catch (e) {
    if (e instanceof FirebaseAuthError && /WEAK_PASSWORD/.test(e.code)) {
      return NextResponse.json({ error: 'weak_password' }, { status: 422 });
    }
    throw e;
  }

  // A password change usually means "I think my account was
  // compromised". Revoke every OTHER session so a thief who still has
  // a live cookie on another device is kicked out. We keep the current
  // session (the device doing the change) alive.
  try {
    const ids = await listSessionsForUser(kv, session.userId);
    await Promise.allSettled(ids.filter((id) => id !== sid).map((id) => destroySession(kv, id)));
  } catch { /* best-effort — don't fail the password change on cleanup */ }

  return NextResponse.json({ ok: true, changedAt: new Date().toISOString() });
}
