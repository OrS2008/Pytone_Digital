// PATCH /api/admin/users/<email>/access
//
// Admin tools for managing a single user's access state. The body
// picks one of four actions:
//
//   { action: "extendTrial",   days: number }
//   { action: "grantSubscription", days: number }    // adds days; opens-ended if user already paid
//   { action: "cancelSubscription" }                 // clears subscribedUntil
//   { action: "resetTrial" }                         // moves trialStartedAt to now
//
// Returns the updated AccessState the dashboard renders into the
// "Status" pill so the table refreshes without a full reload.
//
// The endpoint is admin-only; the requireAdmin guard already checks
// the session cookie + role. We deliberately don't expose price
// changes from here — billing comes from Stripe webhooks; this is a
// manual override for support cases ("their card failed but they're
// a friend of the founder, grant 30 days").

import { NextRequest, NextResponse } from 'next/server';
import { getKV } from '@/lib/cfEnv';
import { requireAdmin } from '@/lib/adminGuard';
import { accessState, findUserByEmail, normaliseEmail, type UserRecord } from '@/lib/auth/users';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const DAY = 24 * 60 * 60 * 1000;

type Body =
  | { action: 'extendTrial';        days: number }
  | { action: 'grantSubscription';  days: number }
  | { action: 'cancelSubscription' }
  | { action: 'resetTrial' };

function validate(b: unknown): { ok: true; body: Body } | { ok: false; msg: string } {
  if (!b || typeof b !== 'object') return { ok: false, msg: 'expected JSON body' };
  const o = b as Record<string, unknown>;
  if (typeof o.action !== 'string') return { ok: false, msg: 'missing action' };
  if (o.action === 'extendTrial' || o.action === 'grantSubscription') {
    const days = typeof o.days === 'number' ? o.days : NaN;
    if (!Number.isFinite(days) || days <= 0 || days > 3650) {
      return { ok: false, msg: 'days must be a positive number ≤ 3650' };
    }
    return { ok: true, body: { action: o.action as 'extendTrial' | 'grantSubscription', days } };
  }
  if (o.action === 'cancelSubscription' || o.action === 'resetTrial') {
    return { ok: true, body: { action: o.action as 'cancelSubscription' | 'resetTrial' } };
  }
  return { ok: false, msg: `unknown action: ${o.action}` };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ email: string }> },
) {
  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;

  const kv = getKV();
  if (!kv) return NextResponse.json({ error: 'storage_unconfigured' }, { status: 503 });

  const { email: raw } = await params;
  const email = normaliseEmail(decodeURIComponent(raw));
  const user = await findUserByEmail(kv, email);
  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let body: Body;
  try {
    const parsed = validate(await req.json());
    if (!parsed.ok) return NextResponse.json({ error: parsed.msg }, { status: 400 });
    body = parsed.body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const now = Date.now();
  const updated: UserRecord = { ...user };

  switch (body.action) {
    case 'extendTrial': {
      // Push trialStartedAt back so the trial keeps running for `days`
      // more from NOW, regardless of where it currently sits. If the
      // trial already expired, this resurrects it.
      const TRIAL_MS = 7 * DAY;
      updated.trialStartedAt = now + body.days * DAY - TRIAL_MS;
      break;
    }
    case 'resetTrial': {
      updated.trialStartedAt = now;
      break;
    }
    case 'grantSubscription': {
      // Add days on top of the existing paid window (or start from now
      // if nothing is paid yet).
      const base = (updated.subscribedUntil && updated.subscribedUntil > now)
        ? updated.subscribedUntil
        : now;
      updated.subscribedUntil = base + body.days * DAY;
      break;
    }
    case 'cancelSubscription': {
      updated.subscribedUntil = 0;
      break;
    }
  }

  await kv.put(`user:${email}`, JSON.stringify(updated));
  const state = accessState(updated, now);

  return NextResponse.json({
    ok:              true,
    action:          body.action,
    userId:          updated.userId,
    email:           updated.email,
    status:          state.status,
    daysLeft:        state.daysLeft,
    trialEndsAt:     state.trialEndsAt,
    subscribedUntil: state.subscribedUntil,
  }, { headers: { 'cache-control': 'no-store' } });
}
