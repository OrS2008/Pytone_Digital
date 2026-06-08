// POST /api/auth/reset-action
//
// Used by /tv/auth-action when the email link is a password-reset
// link (mode=resetPassword in Firebase's query string).
//
// Two sub-actions, picked by the `step` field:
//
//   step="verify" + oobCode
//     → asks Firebase whether the code is valid (without consuming
//       it) and returns the email it was issued for, so the UI can
//       show "Resetting password for X" above the new-password form.
//
//   step="confirm" + oobCode + newPassword
//     → consumes the code, sets the new password, then immediately
//       signs the user in by calling signInWithPassword with the
//       new password. The response carries a session cookie so the
//       user lands on /tv already authenticated — no detour through
//       the login page.

import { NextRequest, NextResponse } from 'next/server';
import { requireKV } from '@/lib/cfEnv';
import { createUserFromFirebase, findUserByEmail, normaliseEmail, touchLastLogin } from '@/lib/auth/users';
import { createSession, setSessionCookieHeader } from '@/lib/auth/serverSession';
import { clearPreverifyCookieHeader, readPreverifyCookie, deletePreverifyHandle } from '@/lib/auth/preverify';
import {
  firebaseVerifyPasswordResetCode,
  firebaseConfirmPasswordReset,
  firebaseSignin,
  FirebaseAuthError,
  FirebaseNotConfiguredError,
} from '@/lib/firebaseAuth';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const kv = requireKV();
  if (kv instanceof Response) return kv;

  let body: { step?: unknown; oobCode?: unknown; newPassword?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }

  const step    = typeof body.step    === 'string' ? body.step    : '';
  const oobCode = typeof body.oobCode === 'string' ? body.oobCode : '';
  if (!oobCode) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  // ----- step 1: validate the link, surface the email ---------------
  if (step === 'verify') {
    try {
      const r = await firebaseVerifyPasswordResetCode(oobCode);
      return NextResponse.json({ ok: true, email: normaliseEmail(r.email || '') });
    } catch (e) {
      if (e instanceof FirebaseNotConfiguredError) {
        return NextResponse.json({ error: 'auth_unconfigured' }, { status: 503 });
      }
      if (e instanceof FirebaseAuthError) {
        return NextResponse.json({ error: 'invalid_or_expired', detail: e.code }, { status: 401 });
      }
      throw e;
    }
  }

  // ----- step 2: apply the new password + sign the user in ---------
  if (step === 'confirm') {
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    if (newPassword.length < 8) return NextResponse.json({ error: 'weak_password' }, { status: 422 });

    let email: string;
    try {
      const r = await firebaseConfirmPasswordReset(oobCode, newPassword);
      email = normaliseEmail(r.email || '');
      if (!email) throw new FirebaseAuthError(500, 'no_email_returned', '');
    } catch (e) {
      if (e instanceof FirebaseNotConfiguredError) {
        return NextResponse.json({ error: 'auth_unconfigured' }, { status: 503 });
      }
      if (e instanceof FirebaseAuthError) {
        if (/WEAK_PASSWORD/.test(e.code)) return NextResponse.json({ error: 'weak_password' }, { status: 422 });
        return NextResponse.json({ error: 'invalid_or_expired', detail: e.code }, { status: 401 });
      }
      throw e;
    }

    // The reset endpoint doesn't return tokens, so we sign in with
    // the password we just set to get a session-grade idToken + UID.
    let firebaseUid: string;
    try {
      const fb = await firebaseSignin(email, newPassword);
      firebaseUid = fb.localId;
    } catch (e) {
      // Should be impossible — we just set this password successfully
      // — but if Firebase fights us we surface the reset success and
      // redirect to /tv/login so the user can sign in manually.
      console.warn('[auth/reset-action] post-reset signin failed', String(e));
      return NextResponse.json({ ok: true, email, redirectTo: '/tv/login?reset=1' });
    }

    let user = await findUserByEmail(kv, email);
    if (!user) {
      user = await createUserFromFirebase(kv, firebaseUid, email);
    } else if (user.userId !== firebaseUid) {
      user = { ...user, userId: firebaseUid, passwordHash: undefined, legacyMigrated: true };
      await kv.put(`user:${email}`, JSON.stringify(user));
    }
    await touchLastLogin(kv, user);

    const sid = await createSession(kv, user.userId, user.email, {
      userAgent: req.headers.get('user-agent') ?? undefined,
      ip:        req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? undefined,
    });

    // Sweep up any leftover preverify cookie too.
    const preverifyCookie = readPreverifyCookie(req);
    if (preverifyCookie) await deletePreverifyHandle(kv, preverifyCookie);

    const headers = new Headers({ 'content-type': 'application/json' });
    headers.append('set-cookie', setSessionCookieHeader(sid));
    headers.append('set-cookie', clearPreverifyCookieHeader());

    return new NextResponse(
      JSON.stringify({ ok: true, email, redirectTo: '/tv' }),
      { status: 200, headers },
    );
  }

  return NextResponse.json({ error: 'bad_step' }, { status: 400 });
}
