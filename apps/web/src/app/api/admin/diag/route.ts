// GET /api/admin/diag
//
// Operator-only diagnostic. Reports whether each Cloudflare binding
// and environment variable is present, plus build / commit info, so
// the admin panel's System tab can render a one-screen "is the deploy
// healthy" view.
//
// Locked behind requireAdmin: leaking which env vars are configured
// helps an attacker prioritise which secret to guess at.

import { NextRequest, NextResponse } from 'next/server';
import { getKV } from '@/lib/cfEnv';
import { requireAdmin } from '@/lib/adminGuard';
import { checkKV, checkEncryption, configChecks } from '@/lib/health';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;

  const [kv, encryption] = await Promise.all([checkKV(), checkEncryption()]);
  return NextResponse.json({
    checks: { kv, encryption, ...configChecks() },
    bindings: {
      NOVA_KV: !!getKV(),
    },
    envVars: {
      ADMIN_USERNAME:       !!process.env.ADMIN_USERNAME,
      ADMIN_PASSWORD_HASH:  !!process.env.ADMIN_PASSWORD_HASH,
      ADMIN_SESSION_SECRET: !!process.env.ADMIN_SESSION_SECRET && process.env.ADMIN_SESSION_SECRET.length >= 32,
      FIREBASE_API_KEY:     !!process.env.FIREBASE_API_KEY,
    },
    app: {
      version: process.env.NEXT_PUBLIC_BUILD_ID || 'dev',
      commit:  process.env.CF_PAGES_COMMIT_SHA ?? null,
    },
  }, { headers: { 'cache-control': 'no-store' } });
}
