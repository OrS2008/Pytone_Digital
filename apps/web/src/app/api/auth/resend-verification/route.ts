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

  try {
    const fb = await firebaseSignin(email, password);
    await firebaseSendOobCode({
      requestType: 'VERIFY_EMAIL',
      idToken:     fb.idToken,
      continueUrl: `${originUrl(req)}/tv/login?verified=1`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof FirebaseNotConfiguredError) {
      return NextResponse.json({ error: 'auth_unconfigured' }, { status: 503 });
    }
    if (e instanceof FirebaseAuthError) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
    }
    throw e;
  }
}
