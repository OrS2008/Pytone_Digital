// POST /api/auth/signup
//
// Body: { email, password }
// Response: 201 + { ok: true, email, emailSent } and Set-Cookie: ns_session=...
// Errors:
//   400 — missing / malformed fields
//   409 — email already registered
//   503 — NOVA_KV binding not configured
//
// Firebase Authentication is the password store and email transport. We
// also keep a KV record per user keyed by the Firebase UID — that's
// where the trial / subscription / profile data lives. The KV row is
// effectively a join key between Firebase Auth and the rest of Nova
// Stream (settings, history, recordings).

import { NextRequest, NextResponse } from 'next/server';
import { requireKV } from '@/lib/cfEnv';
import { createUserFromFirebase, findUserByEmail, normaliseEmail } from '@/lib/auth/users';
import { createSession, setSessionCookieHeader } from '@/lib/auth/serverSession';
import {
  firebaseSignup,
  firebaseSendOobCode,
  FirebaseAuthError,
  FirebaseNotConfiguredError,
} from '@/lib/firebaseAuth';

export const runtime = 'edge';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function originUrl(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host  = req.headers.get('x-forwarded-host')  || req.headers.get('host');
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

export async function POST(req: NextRequest) {
  try {
    const kv = requireKV();
    if (kv instanceof Response) return kv;

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

    // Trigger Firebase to email the verification link. `continueUrl`
    // points back to our /tv/login so the user lands on a familiar
    // screen after clicking through the Firebase action page.
    let emailSent = true;
    try {
      await firebaseSendOobCode({
        requestType: 'VERIFY_EMAIL',
        idToken:     firebaseUser.idToken,
        continueUrl: `${originUrl(req)}/tv/login?verified=1`,
      });
    } catch (e) {
      emailSent = false;
      console.warn('[auth/signup] verification email send failed', String(e));
    }

    // Sign the user in immediately — they can use the app during the
    // trial window before they click the verification link.
    const sid = await createSession(kv, user.userId, user.email, {
      userAgent: req.headers.get('user-agent') ?? undefined,
      ip:        req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? undefined,
    });

    return new NextResponse(JSON.stringify({ ok: true, email: user.email, emailSent }), {
      status: 201,
      headers: {
        'content-type': 'application/json',
        'set-cookie':   setSessionCookieHeader(sid),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'signup_failed', detail: message }, { status: 500 });
  }
}
