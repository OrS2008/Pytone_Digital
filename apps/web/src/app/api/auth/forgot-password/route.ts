// POST /api/auth/forgot-password
//
// Triggers Firebase Authentication to email a password-reset link.
// Firebase handles the link, the password-update page, and the actual
// password update. Our role is now just "ask Firebase to send the
// email" — no more KV-stored reset tokens, no more Brevo.
//
// Body: { email }
// Response: constant 200 { ok: true } regardless of whether the email
// is registered, so the response cannot be used to enumerate accounts.

import { NextRequest, NextResponse } from 'next/server';
import { getKV } from '@/lib/cfEnv';
import { normaliseEmail } from '@/lib/auth/users';
import { rateLimit, callerIp, tooManyRequests } from '@/lib/rateLimit';
import {
  firebaseSendOobCode,
  FirebaseAuthError,
  FirebaseNotConfiguredError,
} from '@/lib/firebaseAuth';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function originUrl(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host  = req.headers.get('x-forwarded-host')  || req.headers.get('host');
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

export async function POST(req: NextRequest) {
  // Throttle reset-email bombing: 5 requests / 15 min per IP. Best-
  // effort — if KV isn't bound we skip the limit rather than break the
  // flow.
  const kv = getKV();
  if (kv) {
    const rl = await rateLimit(kv, 'forgot', callerIp(req), 5, 900);
    if (!rl.ok) return tooManyRequests(rl.retryAfter);
  }

  let body: { email?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }

  const email = typeof body.email === 'string' ? normaliseEmail(body.email) : '';
  if (!EMAIL_RX.test(email)) {
    return NextResponse.json({ error: 'bad_email' }, { status: 400 });
  }

  // Constant-shape response: we always claim "if an account exists,
  // we sent a link". Firebase's own sendOobCode returns 200 OK even
  // for unregistered emails (when EMAIL_NOT_FOUND protection is on),
  // so the caller can't probe the response either.
  const okResponse = NextResponse.json({ ok: true });

  try {
    await firebaseSendOobCode({
      requestType: 'PASSWORD_RESET',
      email,
      continueUrl: `${originUrl(req)}/tv/login`,
    });
  } catch (e) {
    if (e instanceof FirebaseNotConfiguredError) {
      console.warn('[auth/forgot-password] FIREBASE_API_KEY not set');
    } else if (e instanceof FirebaseAuthError) {
      // EMAIL_NOT_FOUND surfaces here when the project has email-
      // enumeration protection OFF. We deliberately swallow it.
      if (!/EMAIL_NOT_FOUND/.test(e.code)) {
        console.warn('[auth/forgot-password]', e.status, e.code);
      }
    } else {
      console.warn('[auth/forgot-password] unexpected', String(e));
    }
  }

  return okResponse;
}
