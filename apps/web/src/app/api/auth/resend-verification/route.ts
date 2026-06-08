// POST /api/auth/resend-verification
//
// Re-sends the Firebase Auth verification email for an account that
// signed up but never clicked the original link.
//
// Body: { email, password } — we need the password because Firebase's
// sendOobCode(VERIFY_EMAIL) requires the user's own idToken, which we
// obtain by signing in. Forcing the password keeps strangers from
// spamming an inbox with verification mail.
//
// Response: 200 + { ok: true } in every successful case (sent + already
// verified) so the response shape can't be used to enumerate.
// Errors:
//   400 — missing fields
//   401 — wrong credentials
//   503 — auth not configured

import { NextRequest, NextResponse } from 'next/server';
import { normaliseEmail } from '@/lib/auth/users';
import {
  firebaseSignin,
  firebaseSendOobCode,
  FirebaseAuthError,
  FirebaseNotConfiguredError,
} from '@/lib/firebaseAuth';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function originUrl(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host  = req.headers.get('x-forwarded-host')  || req.headers.get('host');
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

export async function POST(req: NextRequest) {
  let body: { email?: unknown; password?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }

  const email    = typeof body.email    === 'string' ? normaliseEmail(body.email) : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  let idToken: string;
  try {
    const fb = await firebaseSignin(email, password);
    idToken = fb.idToken;
  } catch (e) {
    if (e instanceof FirebaseNotConfiguredError) {
      return NextResponse.json({ error: 'auth_unconfigured' }, { status: 503 });
    }
    if (e instanceof FirebaseAuthError) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
    }
    throw e;
  }

  // Two-step send: try the one-click /tv/auth-action continueUrl
  // first; if Firebase says the domain isn't authorised, retry
  // without continueUrl so the user still gets a working (if less
  // pretty) Firebase-hosted verification page.
  try {
    await firebaseSendOobCode({
      requestType: 'VERIFY_EMAIL',
      idToken,
      continueUrl: `${originUrl(req)}/tv/auth-action`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof FirebaseAuthError && /UNAUTHORIZED_CONTINUE_URI|INVALID_CONTINUE_URI/i.test(e.code)) {
      try {
        await firebaseSendOobCode({ requestType: 'VERIFY_EMAIL', idToken });
        return NextResponse.json({ ok: true, warning: 'continue_url_unauthorised' });
      } catch (e2) {
        const detail = e2 instanceof FirebaseAuthError ? e2.code : (e2 as Error).message;
        return NextResponse.json({ error: 'send_failed', detail }, { status: 502 });
      }
    }
    const detail = e instanceof FirebaseAuthError ? e.code : (e as Error).message;
    return NextResponse.json({ error: 'send_failed', detail }, { status: 502 });
  }
}
