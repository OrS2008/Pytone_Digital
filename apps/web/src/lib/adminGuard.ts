// Server-side admin auth guard for /api/admin/* routes.
//
// Reads the ns_admin cookie, verifies the HMAC signature, and returns
// the claims if valid. On failure returns a 401 / 503 Response that the
// caller can early-return. Centralised so every admin route gets the
// same gate without copy-pasting the cookie / secret / claim plumbing.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, verifyAdminToken, type AdminClaims } from './adminSession';

export async function requireAdmin(
  req: NextRequest,
): Promise<AdminClaims | Response> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'admin_not_configured', hint: 'Set ADMIN_SESSION_SECRET in Cloudflare Pages → Variables.' },
      { status: 503 },
    );
  }
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const claims = await verifyAdminToken(token, secret);
  if (!claims) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return claims;
}
