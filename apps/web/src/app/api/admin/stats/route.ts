// GET /api/admin/stats
//
// Returns real KV-derived counters for the admin overview. We page
// through the `user:` prefix and tally categories — at our current
// scale (≤ low thousands of users) this is a single KV.list call
// per category that returns within budget. For 100k+ users this
// route will need to switch to a maintained counter (Durable
// Object or a periodic Cron Trigger that snapshots into KV).
//
// Shape:
//   {
//     users:        { total, trialing, subscribed, expired },
//     sessions:     { total },
//     settings:     { total, approxBytes },
//     storage:      { listCallsBudget, listCallsUsed },
//   }

import { NextRequest, NextResponse } from 'next/server';
import { getKV } from '@/lib/cfEnv';
import { requireAdmin } from '@/lib/adminGuard';
import { accessState, type UserRecord } from '@/lib/auth/users';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Cap so a single Workers invocation never spends an unbounded amount
// of CPU walking KV. At 1000 keys per list call this lets us inspect
// up to 8000 users / sessions before reporting a partial result.
const MAX_LIST_CALLS = 8;

async function tally<T>(
  kv: NonNullable<ReturnType<typeof getKV>>,
  prefix: string,
  onEach: (value: string, name: string) => void,
): Promise<{ total: number; complete: boolean; calls: number }> {
  let cursor: string | undefined;
  let total = 0;
  let calls = 0;
  let complete = false;
  while (calls < MAX_LIST_CALLS) {
    calls++;
    const page = await (kv.list as NonNullable<typeof kv.list>)({ prefix, cursor, limit: 1000 });
    for (const key of page.keys) {
      total++;
      // Skip reading the value when the caller doesn't care about it.
      // Listing alone gives us names, which is enough for "count
      // sessions" but not for "categorise users by trial state".
      if (onEach === noopValueReader as unknown as typeof onEach) continue;
      const raw = await kv.get(key.name);
      if (raw != null) onEach(raw, key.name);
    }
    if (page.list_complete) { complete = true; break; }
    cursor = page.cursor;
  }
  // Silence the unused-T type-arg warning at call sites.
  void (undefined as T | undefined);
  return { total, complete, calls };
}

function noopValueReader() { /* listing-only mode */ }

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;

  const kv = getKV();
  if (!kv || !kv.list) {
    return NextResponse.json({ error: 'storage_unconfigured' }, { status: 503 });
  }

  // Users — read full values so we can bucket by access state.
  let trialing = 0, subscribed = 0, expired = 0;
  let approxSettingsBytes = 0;
  const users = await tally<UserRecord>(kv, 'user:', (raw) => {
    try {
      const u = JSON.parse(raw) as UserRecord;
      const state = accessState(u);
      if      (state.status === 'trial')      trialing++;
      else if (state.status === 'subscribed') subscribed++;
      else                                    expired++;
    } catch { /* malformed row — skip */ }
  });

  // Sessions and settings — listing-only is enough; we'd just need
  // counts. Settings size estimation samples values.
  const sessions = await tally(kv, 'session:', noopValueReader);
  const settings = await tally(kv, 'settings:', (raw) => {
    approxSettingsBytes += raw.length;
  });

  return NextResponse.json({
    users: {
      total:    users.total,
      trialing,
      subscribed,
      expired,
      complete: users.complete,
    },
    sessions: {
      total:    sessions.total,
      complete: sessions.complete,
    },
    settings: {
      total:        settings.total,
      approxBytes:  approxSettingsBytes,
      complete:     settings.complete,
    },
    budget: {
      maxListCalls: MAX_LIST_CALLS,
      callsUsed:    users.calls + sessions.calls + settings.calls,
    },
  }, { headers: { 'cache-control': 'no-store' } });
}
