// GDPR Article 17 (right to erasure / "right to be forgotten").
//
// POST /api/privacy/delete
//   Authenticated. Body: { password: string }
//
//   The password is the user's CURRENT one. We use it to sign in to
//   Firebase Authentication (so we hold a fresh idToken proving the
//   requester is the account owner), then call accounts:delete to
//   wipe the Firebase Auth record. After Firebase has removed the
//   identity we clean up our own KV state:
//     - user:<email>           — the account record
//     - settings:<userId>      — the sync blob (M3U URLs, EPG, prefs)
//     - history:<userId>       — best-effort, watch history
//     - session:<currentId>    — this device's session
//   The response Set-Cookie clears ns_session so the browser forgets
//   the session id on its end too.
//
// Why password proof: the user-facing intent is "delete forever".
// Asking for the password makes session-hijack-based deletion
// dramatically harder — a stolen cookie alone isn't enough.

import { NextRequest, NextResponse } from 'next/server';
import { requireKV } from '@/lib/cfEnv';
import {
  clearSessionCookieHeader,
  destroySession,
  listSessionsForUser,
  readSession,
  readSessionCookie,
} from '@/lib/auth/serverSession';
import { rateLimit, tooManyRequests } from '@/lib/rateLimit';
import {
  firebaseSignin,
  firebaseDeleteAccount,
  FirebaseAuthError,
  FirebaseNotConfiguredError,
} from '@/lib/firebaseAuth';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const kv = requireKV();
  if (kv instanceof Response) return kv;

  const sid = readSessionCookie(req);
  const session = sid ? await readSession(kv, sid) : null;
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { password?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }

  const password = typeof body.password === 'string' ? body.password : '';
  if (!password) return NextResponse.json({ error: 'password_required' }, { status: 400 });

  // The Firebase sign-in below turns this route into a password oracle:
  // a stolen session could otherwise brute-force the account password
  // here at full speed. Same budget and account-keying as
  // change-password, which has the identical exposure.
  {
    const rl = await rateLimit(kv, 'privacy-delete', session.userId, 10, 900);
    if (!rl.ok) return tooManyRequests(rl.retryAfter);
  }

  // Re-authenticate against Firebase to (a) confirm the requester owns
  // the account, and (b) get an idToken to authorise accounts:delete.
  let idToken: string;
  try {
    const fb = await firebaseSignin(session.email, password);
    idToken = fb.idToken;
  } catch (e) {
    if (e instanceof FirebaseNotConfiguredError) {
      return NextResponse.json({ error: 'auth_unconfigured' }, { status: 503 });
    }
    if (e instanceof FirebaseAuthError) {
      return NextResponse.json({ error: 'wrong_password' }, { status: 401 });
    }
    throw e;
  }

  // Firebase removal first — if it fails we keep the KV row so the
  // user can retry (rather than landing in a "KV gone, Firebase
  // record stuck around" half-state).
  try {
    await firebaseDeleteAccount(idToken);
  } catch (e) {
    if (e instanceof FirebaseAuthError) {
      return NextResponse.json({ error: 'firebase_delete_failed', detail: e.code }, { status: 502 });
    }
    throw e;
  }

  // Revoke EVERY session, not just this device's. "Delete forever" that
  // leaves the user's other phones and TVs holding live session tokens
  // is not erasure — those ids stay valid in KV until their 30-day TTL
  // lapses. change-password already fans out this way; the destructive
  // route has more reason to, not less.
  const emailKey = session.email.toLowerCase().trim();
  const allSessionIds = await listSessionsForUser(kv, session.userId);
  if (!allSessionIds.includes(sid)) allSessionIds.push(sid);
  await Promise.allSettled([
    kv.delete(`user:${emailKey}`),
    kv.delete(`settings:${session.userId}`),
    kv.delete(`history:${session.userId}`),
    ...allSessionIds.map((id) => destroySession(kv, id)),
  ]);

  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' });
  headers.append('set-cookie', clearSessionCookieHeader());
  return new Response(JSON.stringify({ ok: true, deletedAt: new Date().toISOString() }), {
    status: 200,
    headers,
  });
}
