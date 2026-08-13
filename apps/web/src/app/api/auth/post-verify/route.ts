// POST /api/auth/post-verify
//
// Signs the user in after Firebase's own hosted action page already
// flipped emailVerified=true. The user lands on /tv/auth-action with
// NO oobCode (Firebase consumed it on their side), but our preverify
// HTTP-only cookie is still attached. We exchange its refresh token
// for an idToken, confirm Firebase now reports the address as
// verified, mint a session cookie, and tell the page to redirect to
// /tv.
//
// This is the "Continue → instant home screen" path that the custom
// action URL would normally hand us — except it works whether or not
// the operator successfully configured the custom action URL in
// Firebase Console.
//
// Response: 200 + { ok, email, redirectTo: '/tv' } and Set-Cookie.
// Errors:
//   401 — no preverify cookie / refresh failed
//   403 — refresh succeeded but emailVerified still false
//   503 — KV / Firebase not configured

import { NextRequest, NextResponse } from 'next/server';
import { requireKV } from '@/lib/cfEnv';
import { createUserFromFirebase, findUserByEmail, normaliseEmail, touchLastLogin } from '@/lib/auth/users';
import { createSession, setSessionCookieHeader } from '@/lib/auth/serverSession';
import {
  readPreverifyCookie,
  readPreverifyHandle,
  deletePreverifyHandle,
  clearPreverifyCookieHeader,
} from '@/lib/auth/preverify';
import {
  firebaseExchangeRefreshToken,
  firebaseLookupByIdToken,
  FirebaseAuthError,
  FirebaseNotConfiguredError,
} from '@/lib/firebaseAuth';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const kv = requireKV();
  if (kv instanceof Response) return kv;

  const cookie = readPreverifyCookie(req);
  const handle = await readPreverifyHandle(kv, cookie);
  if (!handle) {
    return NextResponse.json({ error: 'no_preverify_handle' }, { status: 401 });
  }

  let idToken: string;
  let firebaseUid: string;
  try {
    const r = await firebaseExchangeRefreshToken(handle.refreshToken);
    idToken     = r.id_token;
    firebaseUid = r.user_id;
  } catch (e) {
    if (e instanceof FirebaseNotConfiguredError) {
      return NextResponse.json({ error: 'auth_unconfigured' }, { status: 503 });
    }
    return new NextResponse(JSON.stringify({ error: 'refresh_failed' }), {
      status: 401,
      headers: {
        'content-type': 'application/json',
        'set-cookie':   clearPreverifyCookieHeader(),
      },
    });
  }

  // Confirm Firebase now considers the address verified. If the user
  // landed here without actually clicking through Firebase's action
  // page, we'd be silently letting them in without verification —
  // exactly what the gate is meant to prevent.
  try {
    const info = await firebaseLookupByIdToken(idToken);
    if (!info?.emailVerified) {
      return NextResponse.json({ error: 'still_unverified' }, { status: 403 });
    }
  } catch (e) {
    if (e instanceof FirebaseAuthError) {
      return NextResponse.json({ error: 'lookup_failed', detail: e.code }, { status: 401 });
    }
    throw e;
  }

  const email = normaliseEmail(handle.email);
  let user = await findUserByEmail(kv, email);
  if (!user) {
    user = await createUserFromFirebase(kv, firebaseUid, email);
  } else if (user.userId !== firebaseUid) {
    user = { ...user, userId: firebaseUid, passwordHash: undefined };
    await kv.put(`user:${email}`, JSON.stringify(user));
  }
  await touchLastLogin(kv, user);

  const sid = await createSession(kv, user.userId, user.email, {
    userAgent: req.headers.get('user-agent') ?? undefined,
    // cf-connecting-ip only. x-forwarded-for is client-supplied, and
    // this value is shown on the Devices screen — the surface a user
    // checks to spot an unfamiliar sign-in. Honouring the forgeable
    // header let a stolen-credential session paint itself with any
    // address it liked. /api/stream already refuses to trust it.
    ip:        req.headers.get('cf-connecting-ip') ?? undefined,
  });

  // Drop the preverify handle — its job is done.
  await deletePreverifyHandle(kv, cookie);

  const headers = new Headers({ 'content-type': 'application/json' });
  headers.append('set-cookie', setSessionCookieHeader(sid));
  headers.append('set-cookie', clearPreverifyCookieHeader());

  return new NextResponse(
    JSON.stringify({ ok: true, email: user.email, redirectTo: '/tv' }),
    { status: 200, headers },
  );
}
