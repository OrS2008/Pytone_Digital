// POST /api/auth/forgot-password
//
// Email-driven password reset, step 1 of 2:
//   1. Caller POSTs { email }
//   2. We look up the user in KV. If they exist we generate a random
//      reset token, store pwreset:<token> in KV with TTL 30min, and
//      email the user a link to /tv/reset-password?token=<token>.
//   3. If they don't exist we still return 200 with the same body —
//      same delay, no error — so the response can't be used to
//      enumerate registered emails.
//
// The reset endpoint (step 2) lives at /api/auth/reset-password and
// trades the token + a new password for an updated user record.
//
// Mail delivery uses the existing Mailtrap integration. If Mailtrap
// is misconfigured we still return 200 to the user (so the email
// existence check isn't betrayed) but the deploy log records the
// upstream error.

import { NextRequest, NextResponse } from 'next/server';
import { requireKV } from '@/lib/cfEnv';
import { findUserByEmail, normaliseEmail } from '@/lib/auth/users';
import { randomId } from '@/lib/auth/password';
import { sendMail, renderResetEmail, MailtrapError } from '@/lib/mailtrap';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const TOKEN_TTL_SEC = 30 * 60;
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ResetTokenRecord {
  userId:    string;
  email:     string;
  createdAt: number;
}

function originUrl(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host  = req.headers.get('x-forwarded-host')  || req.headers.get('host');
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

export async function POST(req: NextRequest) {
  const kv = requireKV();
  if (kv instanceof Response) return kv;

  let body: { email?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }

  const email = typeof body.email === 'string' ? normaliseEmail(body.email) : '';
  if (!EMAIL_RX.test(email)) {
    return NextResponse.json({ error: 'bad_email' }, { status: 400 });
  }

  // Constant-shape response: we always claim "if an account exists,
  // we sent a link". Whether one actually got sent depends on whether
  // the email is registered, but the caller can't tell from the
  // response.
  const okResponse = NextResponse.json({ ok: true });

  const user = await findUserByEmail(kv, email);
  if (!user) return okResponse;

  const token = randomId();
  const record: ResetTokenRecord = {
    userId:    user.userId,
    email:     user.email,
    createdAt: Date.now(),
  };
  await kv.put(`pwreset:${token}`, JSON.stringify(record), { expirationTtl: TOKEN_TTL_SEC });

  const resetUrl = `${originUrl(req)}/tv/reset-password?token=${encodeURIComponent(token)}`;
  const { subject, text, html } = renderResetEmail({ email: user.email, resetUrl });

  try {
    await sendMail({ to: user.email, subject, text, html, category: 'password-reset' });
  } catch (e) {
    if (e instanceof MailtrapError) {
      console.warn('[auth/forgot-password]', e.status, e.body.slice(0, 300));
    } else {
      console.warn('[auth/forgot-password] unexpected', String(e));
    }
    // Still return 200 so the caller can't probe for delivery failures.
  }

  return okResponse;
}
