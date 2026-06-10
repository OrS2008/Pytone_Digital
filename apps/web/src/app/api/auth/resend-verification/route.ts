// POST /api/auth/resend-verification
//
// Re-sends the Firebase Auth verification email for an account that
// signed up but never clicked the original link. No body required —
// proof of identity comes from the HTTP-only `ns_preverify` cookie
// that /api/auth/signup just set. The cookie maps to a server-side
// KV row holding the Firebase refresh token, which we exchange for a
// fresh idToken on the fly.
//
// Response: 200 + { ok: true } on success.
// Errors:
//   401 — no preverify cookie, expired KV row, or refresh exchange
//         failed (cookie cleared)
//   503 — KV / Firebase not configured

import { NextRequest, NextResponse } from 'next/server';
import { requireKV } from '@/lib/cfEnv';
import { canonicalOrigin } from '@/lib/publicUrl';
import {
  readPreverifyCookie,
  readPreverifyHandle,
  clearPreverifyCookieHeader,
} from '@/lib/auth/preverify';
import {
  firebaseExchangeRefreshToken,
  firebaseSendOobCode,
  FirebaseAuthError,
  FirebaseNotConfiguredError,
} from '@/lib/firebaseAuth';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const kv = requireKV();
  if (kv instanceof Response) return kv;

  const cookie = readPreverifyCookie(req);
  const handle = await readPreverifyHandle(kv, cookie);
  if (!handle) {
    // Cookie missing / expired / KV row evicted. Clear the dead
    // cookie so subsequent attempts know to fall back to a fresh
    // signin (the resend page will surface the sign-in link).
    return new NextResponse(JSON.stringify({ error: 'no_preverify_handle' }), {
      status: 401,
      headers: {
        'content-type': 'application/json',
        'set-cookie':   clearPreverifyCookieHeader(),
      },
    });
  }

  let idToken: string;
  try {
    const r = await firebaseExchangeRefreshToken(handle.refreshToken);
    idToken = r.id_token;
  } catch (e) {
    if (e instanceof FirebaseNotConfiguredError) {
      return NextResponse.json({ error: 'auth_unconfigured' }, { status: 503 });
    }
    return new NextResponse(JSON.stringify({ error: 'refresh_failed' }), {
      status: 401,
      headers: {
        'content-type': 'application/json',
        'set-cookie':   clearPreverifyCookieHeader(),
      },
    });
  }

  // Two-step send (same fallback as signup): try the one-click
  // /tv/auth-action continueUrl first; on UNAUTHORIZED_CONTINUE_URI
  // retry with no continueUrl so the user still gets a working
  // verification link (Firebase-hosted fallback).
  try {
    await firebaseSendOobCode({
      requestType: 'VERIFY_EMAIL',
      idToken,
      continueUrl: `${canonicalOrigin(req)}/tv/auth-action`,
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
