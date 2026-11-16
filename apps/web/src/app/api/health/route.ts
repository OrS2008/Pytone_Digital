// GET /api/health — liveness + storage check for uptime monitors.
// Public and deliberately minimal: no configuration details.
import { NextResponse } from 'next/server';
import { checkKV } from '@/lib/health';

export const dynamic = 'force-dynamic';

export async function GET() {
  const kv = await checkKV();
  return NextResponse.json(
    { status: kv.ok ? 'ok' : 'degraded', storage: kv.ok ? 'ok' : 'unavailable', build: process.env.NEXT_PUBLIC_BUILD_ID || null, time: new Date().toISOString() },
    { status: kv.ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
