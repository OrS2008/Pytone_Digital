// GET /api/admin/whoami — returns the signed-in admin if the cookie is valid.

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, ADMIN_COOKIE } from '@/lib/adminSession';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return NextResponse.json({ ok: false }, { status: 503 });
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!token) return NextResponse.json({ ok: false });
  const claims = await verifyAdminToken(token, secret);
  if (!claims) return NextResponse.json({ ok: false });
  return NextResponse.json({ ok: true, sub: claims.sub, exp: claims.exp });
}
