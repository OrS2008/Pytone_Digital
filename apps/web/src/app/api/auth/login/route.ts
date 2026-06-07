// POST /api/auth/login — verify password, mint a session cookie.
//
// Body: { email, password }
// Response: 200 + { ok: true, email } and Set-Cookie: ns_session=...
// Errors:
//   400 — missing fields
//   401 — wrong email / password (deliberately one code for both, so
//         attackers can't enumerate registered emails)
//   503 — NOVA_KV not configured

import { NextRequest, NextResponse } from 'next/server';
import { requireKV } from '@/lib/cfEnv';
import { loginUser, normaliseEmail } from '@/lib/auth/users';
import { createSession, setSessionCookieHeader } from '@/lib/auth/serverSession';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const kv = requireKV();
  if (kv instanceof Response) return kv;

  let body: { email?: unknown; password?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }

  const email    = typeof body.email    === 'string' ? normaliseEmail(body.email) : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const user = await loginUser(kv, email, password);
  if (!user) return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });

  const sid = await createSession(kv, user.userId, user.email, {
    userAgent: req.headers.get('user-agent') ?? undefined,
    ip:        req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? undefined,
  });
  return new NextResponse(JSON.stringify({ ok: true, email: user.email }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie':   setSessionCookieHeader(sid),
    },
  });
}
