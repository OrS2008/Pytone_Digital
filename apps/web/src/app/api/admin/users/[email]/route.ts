// DELETE /api/admin/users/<email>
//
// Removes the user record and their settings blob. Existing session
// cookies become unusable on the next /api/auth/me check because the
// user lookup returns null. Sessions for that email aren't enumerated
// here for the same reason GDPR delete doesn't: KV doesn't index
// sessions per user. They'll fall out within the 30-day TTL.

import { NextRequest, NextResponse } from 'next/server';
import { getKV } from '@/lib/cfEnv';
import { requireAdmin } from '@/lib/adminGuard';
import { findUserByEmail, normaliseEmail } from '@/lib/auth/users';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function DELETE(
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
  if (!user) return NextResponse.json({ ok: true, alreadyGone: true });

  await Promise.allSettled([
    kv.delete(`user:${email}`),
    kv.delete(`settings:${user.userId}`),
  ]);
  return NextResponse.json({ ok: true, deletedAt: new Date().toISOString() });
}
