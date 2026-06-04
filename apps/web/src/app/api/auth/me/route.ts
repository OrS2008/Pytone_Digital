// GET /api/auth/me — returns the current session's user, or 401.
//
// Used on every page boot to decide whether to render the app or
// redirect to the login page. We also return the trial / subscription
// status so the client can gate playback locally without doing a second
// round-trip: a single /api/auth/me call answers both
//   "am I signed in?" and
//   "do I still have access?"
//
// Shape:
//   { user: { userId, email, createdAt },
//     access: { status, trialEndsAt, subscribedUntil, daysLeft } }

import { NextRequest, NextResponse } from 'next/server';
import { getKV } from '@/lib/cfEnv';
import { readSession, readSessionCookie } from '@/lib/auth/serverSession';
import { accessState, findUserByEmail } from '@/lib/auth/users';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const kv = getKV();
  if (!kv) return NextResponse.json({ error: 'storage_unconfigured' }, { status: 503 });
  const sid = readSessionCookie(req);
  const session = sid ? await readSession(kv, sid) : null;
  if (!session) return NextResponse.json({ user: null }, { status: 401 });

  const user = await findUserByEmail(kv, session.email);
  if (!user) return NextResponse.json({ user: null }, { status: 401 });

  return NextResponse.json({
    user: {
      userId:    user.userId,
      email:     user.email,
      createdAt: user.createdAt,
    },
    access: accessState(user),
  }, { status: 200 });
}
