// Gates /admin/* on a valid HMAC-signed cookie.
//
// Runs on Netlify's Edge runtime — keep imports minimal. The cookie
// is verified with Web Crypto's HMAC-SHA256; no scrypt (that lives in
// the login route on Node runtime).
//
// /admin/login is allowed through unauthenticated so the user can
// actually sign in; everything else under /admin is locked until the
// session token validates.

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, ADMIN_COOKIE } from '@/lib/adminSession';

export const config = {
  matcher: ['/admin/:path*'],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) console.warn('[middleware] hit', pathname);

  if (pathname === '/admin/login' || pathname.startsWith('/admin/login/')) {
    if (isDev) console.warn('[middleware]   → login path, allow');
    return NextResponse.next();
  }
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    if (isDev) console.warn('[middleware]   → no ADMIN_SESSION_SECRET, redirect');
    const url = req.nextUrl.clone();
    url.pathname = '/admin/login';
    url.searchParams.set('e', 'unavailable');
    return NextResponse.redirect(url);
  }
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (isDev) console.warn('[middleware]   cookie present:', !!token, token ? '(' + token.length + ' chars)' : '');
  const claims = token ? await verifyAdminToken(token, secret) : null;
  if (isDev) console.warn('[middleware]   verified:', !!claims, claims ? '(sub=' + claims.sub + ')' : '');
  if (!claims) {
    if (isDev) console.warn('[middleware]   → invalid/missing token, redirect');
    const url = req.nextUrl.clone();
    url.pathname = '/admin/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  if (isDev) console.warn('[middleware]   → ok, allow');
  return NextResponse.next();
}
