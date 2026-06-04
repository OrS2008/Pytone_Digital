// GDPR Article 15 (right of access) + Article 20 (data portability).
//
// GET /api/privacy/export
//   Authenticated. Returns a JSON file with every piece of personal
//   data we hold for the calling user. Streamed with
//   Content-Disposition: attachment so the browser saves it to disk
//   instead of rendering it.
//
// Shape of the dump:
//   {
//     exportedAt:  ISO timestamp,
//     format:      "nova-stream/v1",
//     user:        { userId, email, createdAt, lastLoginAt },  // no password hash
//     settings:    <the full sync blob — M3U URLs, EPG, prefs, history>,
//     session:     { startedAt, expiresAt }  // metadata only, never the token
//   }
//
// The password hash is omitted on purpose. Hashes are not "personal
// data" under GDPR — they're a security artefact, and exporting one
// would arm an offline attacker if the file leaked. Sessions other
// than the calling one are not enumerated because we don't index
// them per-user; the user can sign out other devices from
// Settings → Security.

import { NextRequest, NextResponse } from 'next/server';
import { requireKV } from '@/lib/cfEnv';
import { readSession, readSessionCookie, SESSION_DAYS } from '@/lib/auth/serverSession';
import { findUserByEmail } from '@/lib/auth/users';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const kv = requireKV();
  if (kv instanceof Response) return kv;

  const sid = readSessionCookie(req);
  const session = sid ? await readSession(kv, sid) : null;
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const user = await findUserByEmail(kv, session.email);
  if (!user) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });

  const settingsRaw = await kv.get(`settings:${user.userId}`);
  let settings: unknown = {};
  if (settingsRaw) {
    try { settings = JSON.parse(settingsRaw); } catch { settings = settingsRaw; }
  }

  const sessionTtlMs = SESSION_DAYS * 24 * 60 * 60 * 1000;

  const dump = {
    exportedAt: new Date().toISOString(),
    format: 'nova-stream/v1',
    user: {
      userId:      user.userId,
      email:       user.email,
      createdAt:   new Date(user.createdAt).toISOString(),
      lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : null,
    },
    settings,
    session: {
      startedAt: new Date(session.createdAt).toISOString(),
      expiresAt: new Date(session.createdAt + sessionTtlMs).toISOString(),
    },
  };

  const body = JSON.stringify(dump, null, 2);
  const filename = `nova-stream-data-${user.email.replace(/[^a-z0-9.-]+/gi, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
