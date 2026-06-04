// GDPR Article 17 (right to erasure / "right to be forgotten").
//
// POST /api/privacy/delete
//   Authenticated. Removes:
//     - user:<email>           — the account record
//     - settings:<userId>      — the sync blob (M3U URLs, EPG, prefs, history)
//     - session:<currentId>    — this device's session record
//   Then emits a Set-Cookie that empties ns_session so the browser
//   forgets the session id on its end too.
//
// What we DON'T do:
//   - Enumerate and delete every session for this user. KV doesn't
//     index sessions per-user; iterating with list() would be slow
//     and expensive. Other devices will get 401 on their next
//     auth-protected request because findUserByEmail will return
//     null, so they're effectively logged out within a minute.
//   - Delete the email from log lines. Diagnostic logs roll off
//     within 7 days; the privacy policy discloses this.
//
// We use POST instead of DELETE because some intermediate proxies
// drop bodies on DELETE and we want a uniform call signature from
// the help page. Idempotent: deleting a missing record is a no-op.

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

export async function POST(req: NextRequest) {
  const kv = requireKV();
  if (kv instanceof Response) return kv;

  const sid = readSessionCookie(req);
  const session = sid ? await readSession(kv, sid) : null;
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Best-effort: any one of these failing leaves the others undone,
  // but that's fine — re-running the call cleans up what's left.
  await Promise.allSettled([
    kv.delete(`user:${session.email.toLowerCase().trim()}`),
    kv.delete(`settings:${session.userId}`),
    destroySession(kv, sid),
  ]);

  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' });
  headers.append('set-cookie', clearSessionCookieHeader());
  return new Response(JSON.stringify({ ok: true, deletedAt: new Date().toISOString() }), {
    status: 200,
    headers,
  });
}
