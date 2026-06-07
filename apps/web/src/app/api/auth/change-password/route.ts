// POST /api/auth/change-password
//
// Authenticated. Verifies the user's current password against the
// stored hash, then writes a fresh PBKDF2 hash for the new password.
// The session cookie stays valid — the user does not get signed out
// from the current device after a password change, only from any
// other device the next time they hit auth (since their hash
// no longer matches).
//
// Body:   { currentPassword: string, newPassword: string }
// Errors: 400 bad request, 401 not signed in, 403 current pwd wrong,
//         422 weak new password, 503 NOVA_KV missing.

import { NextRequest, NextResponse } from 'next/server';
import { requireKV } from '@/lib/cfEnv';
import { readSession, readSessionCookie } from '@/lib/auth/serverSession';
import { findUserByEmail } from '@/lib/auth/users';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const kv = requireKV();
  if (kv instanceof Response) return kv;

  const sid = readSessionCookie(req);
  const session = sid ? await readSession(kv, sid) : null;
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }

  const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const next    = typeof body.newPassword     === 'string' ? body.newPassword     : '';
  if (!current || !next)   return NextResponse.json({ error: 'bad_request' },   { status: 400 });
  if (next.length < 8)     return NextResponse.json({ error: 'weak_password' }, { status: 422 });
  if (next === current)    return NextResponse.json({ error: 'same_password' }, { status: 422 });

  const user = await findUserByEmail(kv, session.email);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const ok = await verifyPassword(current, user.passwordHash);
  if (!ok) return NextResponse.json({ error: 'wrong_password' }, { status: 403 });

  user.passwordHash = await hashPassword(next);
  await kv.put(`user:${user.email}`, JSON.stringify(user));

  return NextResponse.json({ ok: true, changedAt: new Date().toISOString() });
}
