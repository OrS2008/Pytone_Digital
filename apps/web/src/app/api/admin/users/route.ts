// GET /api/admin/users[?cursor=...]
//
// Paginated user list for the admin panel. KV's list() returns up to
// 1000 keys per call; we return one page at a time and pass through
// the cursor so the UI can request the next page.
//
// Shape:
//   {
//     users: [{
//       userId, email, createdAt, lastLoginAt,
//       trialEndsAt, subscribedUntil, status, daysLeft,
//     }],
//     cursor:        string | null,   // null when exhausted
//     listComplete:  boolean,
//   }

import { NextRequest, NextResponse } from 'next/server';
import { getKV } from '@/lib/cfEnv';
import { requireAdmin } from '@/lib/adminGuard';
import { accessState, type UserRecord } from '@/lib/auth/users';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;

  const kv = getKV();
  if (!kv || !kv.list) {
    return NextResponse.json({ error: 'storage_unconfigured' }, { status: 503 });
  }

  const cursor = req.nextUrl.searchParams.get('cursor') || undefined;
  const page = await kv.list({ prefix: 'user:', cursor, limit: PAGE_SIZE });

  const users = [];
  for (const key of page.keys) {
    const raw = await kv.get(key.name);
    if (!raw) continue;
    try {
      const u = JSON.parse(raw) as UserRecord;
      const state = accessState(u);
      users.push({
        userId:          u.userId,
        email:           u.email,
        createdAt:       u.createdAt,
        lastLoginAt:     u.lastLoginAt ?? null,
        trialEndsAt:     state.trialEndsAt,
        subscribedUntil: state.subscribedUntil,
        status:          state.status,
        daysLeft:        state.daysLeft,
      });
    } catch { /* malformed row — skip */ }
  }

  // Sort newest signups first within this page. (Cross-page ordering
  // still follows KV's list order, which is lexicographic on email —
  // that's fine for now; once we want a true sortable view we'll move
  // to a separate index key.)
  users.sort((a, b) => b.createdAt - a.createdAt);

  return NextResponse.json({
    users,
    cursor:       page.list_complete ? null : (page.cursor ?? null),
    listComplete: page.list_complete,
  }, { headers: { 'cache-control': 'no-store' } });
}
