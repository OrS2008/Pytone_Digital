// GET /api/auth/me — returns the current session's user, or 401.
// Used on every page boot to decide whether to render the app or
// redirect to the login page.

import { NextRequest, NextResponse } from 'next/server';
import { getKV } from '@/lib/cfEnv';
import { readSession, readSessionCookie } from '@/lib/auth/serverSession';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const kv = getKV();
  if (!kv) return NextResponse.json({ error: 'storage_unconfigured' }, { status: 503 });
  const sid = readSessionCookie(req);
  const session = sid ? await readSession(kv, sid) : null;
  if (!session) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: { userId: session.userId, email: session.email } }, { status: 200 });
}
