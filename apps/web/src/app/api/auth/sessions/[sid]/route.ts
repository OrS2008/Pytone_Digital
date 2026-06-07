// DELETE /api/auth/sessions/<sid>
//
// Revoke one of the calling user's sessions by sid. The caller must
// own the session — we check that the target session's userId matches
// the userId of the request's own cookie before deleting, so user A
// can never revoke user B's device.
//
// Revoking the current session is allowed (acts as sign-out); the
// route emits Set-Cookie ns_session= with Max-Age=0 in that case so
// the browser stops sending it.

import { NextRequest, NextResponse } from 'next/server';
import { requireKV } from '@/lib/cfEnv';
import {
  clearSessionCookieHeader,
  destroySession,
  readSession,
  readSessionCookie,
} from '@/lib/auth/serverSession';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sid: string }> },
) {
  const kv = requireKV();
  if (kv instanceof Response) return kv;

  const currentSid = readSessionCookie(req);
  const current = currentSid ? await readSession(kv, currentSid) : null;
  if (!current) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { sid: targetSid } = await params;
  const target = await readSession(kv, targetSid);

  // Not found is OK — could be a stale link; idempotent.
  if (!target) return NextResponse.json({ ok: true, alreadyGone: true });

  // Ownership check: can only revoke your own sessions.
  if (target.userId !== current.userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  await destroySession(kv, targetSid);

  // If we just revoked the cookie-bound session, clear the cookie too.
  if (targetSid === currentSid) {
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' });
    headers.append('set-cookie', clearSessionCookieHeader());
    return new Response(JSON.stringify({ ok: true, signedOut: true }), { status: 200, headers });
  }

  return NextResponse.json({ ok: true });
}
