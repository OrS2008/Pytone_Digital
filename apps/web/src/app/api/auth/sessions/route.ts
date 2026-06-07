// GET /api/auth/sessions — every active session for the signed-in user.
//
// Walks user_sessions:<userId>:<sid> (the per-user index written by
// createSession), then reads each session:<sid> to surface the userAgent
// + ip + createdAt the Devices screen renders. Caller is authenticated
// by their own session cookie; we don't accept ?userId= or other
// parameters that would let one user enumerate another's sessions.
//
// Shape:
//   {
//     current: "<this device's sid>",
//     sessions: [{ sid, createdAt, userAgent, ip, isCurrent }],
//   }

import { NextRequest, NextResponse } from 'next/server';
import { requireKV } from '@/lib/cfEnv';
import {
  listSessionsForUser,
  readSession,
  readSessionCookie,
} from '@/lib/auth/serverSession';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const kv = requireKV();
  if (kv instanceof Response) return kv;

  const currentSid = readSessionCookie(req);
  const current = currentSid ? await readSession(kv, currentSid) : null;
  if (!current) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const ids = await listSessionsForUser(kv, current.userId);
  const records = await Promise.all(ids.map(async (sid) => {
    const rec = await readSession(kv, sid);
    if (!rec) return null;
    return {
      sid,
      createdAt: rec.createdAt,
      userAgent: rec.userAgent ?? null,
      ip:        rec.ip        ?? null,
      isCurrent: sid === currentSid,
    };
  }));

  return NextResponse.json({
    current: currentSid,
    sessions: records
      .filter((r): r is NonNullable<typeof r> => r !== null)
      // Newest first; the current device floats to the top within
      // its tied-timestamp group thanks to the isCurrent tiebreaker.
      .sort((a, b) => b.createdAt - a.createdAt || Number(b.isCurrent) - Number(a.isCurrent)),
  }, { headers: { 'cache-control': 'no-store' } });
}
