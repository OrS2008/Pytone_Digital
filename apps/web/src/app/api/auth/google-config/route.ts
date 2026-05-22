// GET /api/auth/google-config
//
// Runtime-readable Google client id. Reads the env var on every
// invocation so the moment an operator sets GOOGLE_CLIENT_ID in
// Netlify (or NEXT_PUBLIC_GOOGLE_CLIENT_ID) the sign-in button comes
// alive — no full rebuild required for the change to propagate to
// the client bundle.

import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  const clientId =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    null;
  return NextResponse.json(
    { clientId },
    { headers: { 'cache-control': 'public, max-age=60, s-maxage=60' } },
  );
}
