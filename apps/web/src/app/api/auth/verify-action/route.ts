// POST /api/auth/verify-action
//
// Single-shot "click → verified + signed in" endpoint.
//
// The user clicks the verification link Firebase emailed them. The link
// points at our /tv/auth-action page (Firebase's "custom action URL"
// pointing back at us) which extracts the oobCode and POSTs here. We:
//
//   1. Hand the oobCode to Firebase via accounts:update. Firebase
//      validates it, flips emailVerified=true on the account, and tells
//      us the email + localId.
//   2. Look up — or lazily create — the matching KV record so the
//      trial clock and other server-side state exist.
//   3. Mint a session cookie just like /api/auth/login does.
//   4. Return { ok, email, redirectTo: '/tv' } and Set-Cookie.
//
// The oobCode is single-use, so step 1 doubles as proof the requester
// owns the inbox. No password needed.
//
// Body: { mode: 'verifyEmail', oobCode: string }
// Errors:
//   400 — missing fields / wrong mode
//   401 — invalid or expired oobCode
//   503 — auth not configured / KV missing

import { NextRequest, NextResponse } from 'next/server';
import { requireKV } from '@/lib/cfEnv';
import { createUserFromFirebase, findUserByEmail, normaliseEmail, touchLastLogin } from '@/lib/auth/users';
import { createSession, setSessionCookieHeader } from '@/lib/auth/serverSession';
import {
  firebaseApplyOobCode,
  FirebaseAuthError,
  FirebaseNotConfiguredError,
} from '@/lib/firebaseAuth';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const kv = requireKV();
  if (kv instanceof Response) return kv;

  let body: { mode?: unknown; oobCode?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }

  const mode    = typeof body.mode    === 'string' ? body.mode    : '';
  const oobCode = typeof body.oobCode === 'string' ? body.oobCode : '';
  if (!oobCode) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  // The endpoint accepts `verifyEmail` (Firebase's name) and a couple
  // of aliases for forward-compat — the auth-action page may surface
  // EMAIL_SIGNIN one day too.
  if (mode !== 'verifyEmail' && mode !== 'VERIFY_EMAIL' && mode !== '') {
    return NextResponse.json({ error: 'unsupported_mode', mode }, { status: 400 });
  }

  let applied;
  try {
    applied = await firebaseApplyOobCode(oobCode);
  } catch (e) {
    if (e instanceof FirebaseNotConfiguredError) {
      return NextResponse.json({ error: 'auth_unconfigured' }, { status: 503 });
    }
    if (e instanceof FirebaseAuthError) {
      // INVALID_OOB_CODE / EXPIRED_OOB_CODE / USER_DISABLED → 401 so
      // the frontend can offer a "request a new link" affordance.
      return NextResponse.json({ error: 'invalid_or_expired', detail: e.code }, { status: 401 });
    }
    throw e;
  }

  const email = normaliseEmail(applied.email || '');
  if (!email) {
    return NextResponse.json({ error: 'invalid_or_expired' }, { status: 401 });
  }

  // Look up or create the KV companion record. A user could have been
  // created in Firebase directly (e.g., import) so the KV side isn't
  // guaranteed to exist yet.
  let user = await findUserByEmail(kv, email);
  if (!user) {
    user = await createUserFromFirebase(kv, applied.localId || email, email);
  }
  await touchLastLogin(kv, user);

  const sid = await createSession(kv, user.userId, user.email, {
    userAgent: req.headers.get('user-agent') ?? undefined,
    ip:        req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? undefined,
  });

  return new NextResponse(
    JSON.stringify({ ok: true, email: user.email, redirectTo: '/tv' }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie':   setSessionCookieHeader(sid),
      },
    },
  );
}
