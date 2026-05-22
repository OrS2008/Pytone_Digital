// POST /api/admin/logout — clears the admin cookie.

import { NextResponse } from 'next/server';
import { ADMIN_COOKIE } from '@/lib/adminSession';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
