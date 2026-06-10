// POST /api/auth/signup
//
// Body: { email, password }
// Response: 201 + { ok: true, email, requiresVerification: true }
//
// We deliberately do NOT issue a session cookie here. The user has to
// open the verification link in the email Firebase just sent them and
// come back through /tv/login. Until then the login route refuses
// their credentials with `email_not_verified`. This is the "no
// access until the address is proven" gate.
//
// Errors:
//   400 — missing / malformed fields
//   409 — email already registered
//   503 — NOVA_KV / FIREBASE_API_KEY not configured

import { NextRequest, NextResponse } from 'next/server';
import { requireKV } from '@/lib/cfEnv';
import { createUserFromFirebase, findUserByEmail, normaliseEmail } from '@/lib/auth/users';
import { createPreverifyHandle, setPreverifyCookieHeader } from '@/lib/auth/preverify';
import { rateLimit, callerIp, tooManyRequests } from '@/lib/rateLimit';
import { canonicalOrigin } from '@/lib/publicUrl';
import {
  firebaseSignup,
  firebaseSendOobCode,
  FirebaseAuthError,
  FirebaseNotConfiguredError,
} from '@/lib/firebaseAuth';

export const runtime = 'edge';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const kv = requireKV();
    if (kv instanceof Response) return kv;

    // Throttle signup spam: 5 new accounts / hour per IP.
    const rl = await rateLimit(kv, 'signup', callerIp(req), 5, 3600);
    if (!rl.ok) return tooManyRequests(rl.retryAfter);

    let body: { email?: unknown; password?: unknown };
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }

    const email    = typeof body.email    === 'string' ? normaliseEmail(body.email) : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!EMAIL_RX.test(email)) return NextResponse.json({ error: 'bad_email' },    { status: 400 });
    if (password.length < 8)   return NextResponse.json({ error: 'weak_password' }, { status: 400 });

    // Sanity check our own KV first — fast and lets us return the
    // crisper 409 before we hit Firebase.
    const existing = await findUserByEmail(kv, email);
    if (existing) return NextResponse.json({ error: 'email_taken' }, { status: 409 });

    // Create the Firebase Auth user. Firebase becomes the source of
    // truth for the password hash + email verification state.
    let firebaseUser;
    try {
      firebaseUser = await firebaseSignup(email, password);
    } catch (e) {
      if (e instanceof FirebaseNotConfiguredError) {
        return NextResponse.json({ error: 'auth_unconfigured', detail: 'FIREBASE_API_KEY not set' }, { status: 503 });
      }
      if (e instanceof FirebaseAuthError) {
        if (/EMAIL_EXISTS/.test(e.code)) return NextResponse.json({ error: 'email_taken' }, { status: 409 });
        if (/WEAK_PASSWORD/.test(e.code)) return NextResponse.json({ error: 'weak_password' }, { status: 400 });
        if (/INVALID_EMAIL/.test(e.code)) return NextResponse.json({ error: 'bad_email' },    { status: 400 });
        return NextResponse.json({ error: 'signup_failed', detail: e.code }, { status: 502 });
      }
      throw e;
    }

    // Mirror the Firebase user into our KV. UserRecord.userId is the
    // Firebase UID so every settings / history blob keyed by userId
    // joins back to the auth identity without an extra lookup.
    const user = await createUserFromFirebase(kv, firebaseUser.localId, email);

    // Trigger Firebase to email the verification link. Two-step send:
    // first with a continueUrl back to /tv/auth-action (so the click
    // lands on our one-click verify page); if Firebase rejects the
    // continueUrl as not-authorised (UNAUTHORIZED_CONTINUE_URI — most
    // common cause of "no email arrived"), retry without continueUrl
    // so the user at least gets *some* verification link.
    let emailSent  = false;
    let emailError: string | null = null;
    try {
      await firebaseSendOobCode({
        requestType: 'VERIFY_EMAIL',
        idToken:     firebaseUser.idToken,
        continueUrl: `${canonicalOrigin(req)}/tv/auth-action`,
      });
      emailSent = true;
    } catch (e) {
      if (e instanceof FirebaseAuthError && /UNAUTHORIZED_CONTINUE_URI|INVALID_CONTINUE_URI/i.test(e.code)) {
        try {
          await firebaseSendOobCode({
            requestType: 'VERIFY_EMAIL',
            idToken:     firebaseUser.idToken,
          });
          emailSent  = true;
          emailError = 'continue_url_unauthorised';
          console.warn('[auth/signup] continueUrl rejected — sent without it. Add the domain to Firebase Console → Authentication → Settings → Authorized domains.');
        } catch (e2) {
          emailError = e2 instanceof FirebaseAuthError ? e2.code : (e2 as Error).message;
          console.warn('[auth/signup] verification email send failed (no continueUrl)', emailError);
        }
      } else {
        emailError = e instanceof FirebaseAuthError ? e.code : (e as Error).message;
        console.warn('[auth/signup] verification email send failed', emailError);
      }
    }

    // Stash the freshly-issued Firebase refresh token under a server-
    // side handle and hand the browser the opaque key in an HTTP-only
    // cookie. /api/auth/resend-verification trades the cookie back for
    // a fresh idToken so the "Resend verification email" button can
    // work without prompting for the password again.
    const preverifyToken = await createPreverifyHandle(kv, user.email, firebaseUser.refreshToken);

    // No SESSION cookie here on purpose — the user must verify the
    // email first. /tv/signup redirects to a "check your inbox" page
    // and /tv/login refuses the account until the address is proven.
    // `emailError` surfaces in the response so the signup UI can tell
    // the user (or operator) exactly which Firebase quota / config
    // tripped.
    return new NextResponse(
      JSON.stringify({ ok: true, email: user.email, emailSent, emailError, requiresVerification: true }),
      {
        status: 201,
        headers: {
          'content-type': 'application/json',
          'set-cookie':   setPreverifyCookieHeader(preverifyToken),
        },
      },
    );
  } catch (err) {
    // Log the real reason on the server; return a generic error to the
    // client so KV / runtime internals don't leak to the browser.
    console.error('[auth/signup]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'signup_failed' }, { status: 500 });
  }
}
