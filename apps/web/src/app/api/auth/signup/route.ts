// POST /api/auth/signup
//
// Body: { email, password }
// Response: 201 + { ok: true, email } and Set-Cookie: ns_session=...
// Errors:
//   400 — missing / malformed fields
//   409 — email already registered
//   503 — NOVA_KV binding not configured
//
// On success the user is signed in immediately — no email verification.
// If email verification ever becomes a requirement, the existing
// /api/email/activate route already exists; signup can issue a token
// instead of an active session.

import { NextRequest, NextResponse } from 'next/server';
import { requireKV } from '@/lib/cfEnv';
import { createUser, findUserByEmail, normaliseEmail } from '@/lib/auth/users';
import { createSession, setSessionCookieHeader } from '@/lib/auth/serverSession';

export const runtime = 'edge';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    const existing = await findUserByEmail(kv, email);
    if (existing) return NextResponse.json({ error: 'email_taken' }, { status: 409 });

    const user = await createUser(kv, email, password);
    const sid  = await createSession(kv, user.userId, user.email);

    return new NextResponse(JSON.stringify({ ok: true, email: user.email }), {
      status: 201,
      headers: {
        'content-type': 'application/json',
        'set-cookie':   setSessionCookieHeader(sid),
      },
    });
  } catch (err) {
    // Surface the underlying error to the client while we're stabilising
    // the new KV-backed signup flow. Tightening this back to a generic
    // 500 with no body is on the post-launch list.
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'signup_failed', detail: message }, { status: 500 });
  }
}
