// POST /api/auth/reset-password
//
// Step 2 of the email-driven password reset:
//   Body: { token: string, newPassword: string }
//
// We look up pwreset:<token> in KV. If present, we use the userId on
// the token to load the user record, write a fresh PBKDF2 hash for
// the new password, and delete the token so the link is single-use.
//
// Existing sessions are NOT revoked here. A future enhancement would
// walk user_sessions:<userId>:* and destroy each one, but the
// signed-in cookie on the requesting browser remains valid by
// design — many reset flows want the user to land on the app already
// signed in.
//
// Errors:
//   400 — malformed body
//   404 — token doesn't exist or has expired (single 404 used for
//         both so an attacker can't tell which case applies)
//   422 — new password too weak
//   503 — NOVA_KV missing

import { NextRequest, NextResponse } from 'next/server';
import { requireKV } from '@/lib/cfEnv';
import { findUserByEmail } from '@/lib/auth/users';
import { hashPassword } from '@/lib/auth/password';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

interface ResetTokenRecord {
  userId:    string;
  email:     string;
  createdAt: number;
}

export async function POST(req: NextRequest) {
  const kv = requireKV();
  if (kv instanceof Response) return kv;

  let body: { token?: unknown; newPassword?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }

  const token       = typeof body.token       === 'string' ? body.token       : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  if (!token)                   return NextResponse.json({ error: 'bad_request' },   { status: 400 });
  if (newPassword.length < 8)   return NextResponse.json({ error: 'weak_password' }, { status: 422 });

  const raw = await kv.get(`pwreset:${token}`);
  if (!raw) return NextResponse.json({ error: 'invalid_or_expired' }, { status: 404 });

  let record: ResetTokenRecord;
  try { record = JSON.parse(raw) as ResetTokenRecord; }
  catch { return NextResponse.json({ error: 'invalid_or_expired' }, { status: 404 }); }

  const user = await findUserByEmail(kv, record.email);
  if (!user || user.userId !== record.userId) {
    return NextResponse.json({ error: 'invalid_or_expired' }, { status: 404 });
  }

  user.passwordHash = await hashPassword(newPassword);
  await Promise.all([
    kv.put(`user:${user.email}`, JSON.stringify(user)),
    kv.delete(`pwreset:${token}`),
  ]);

  return NextResponse.json({ ok: true });
}
