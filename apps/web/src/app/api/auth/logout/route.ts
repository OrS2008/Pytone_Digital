// POST /api/auth/logout — destroy the session in KV and clear the cookie.
// Always returns 200, even when the cookie was already missing — the
// client's intent is "I'm logged out now", which is true regardless.

import { NextRequest, NextResponse } from 'next/server';
import { getKV } from '@/lib/cfEnv';
import {
  clearSessionCookieHeader,
  destroySession,
  readSessionCookie,
} from '@/lib/auth/serverSession';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const kv = getKV();
  const sid = readSessionCookie(req);
  if (kv && sid) {
    try { await destroySession(kv, sid); } catch { /* ignore — clearing cookie is what matters */ }
  }
  return new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie':   clearSessionCookieHeader(),
    },
  });
}
