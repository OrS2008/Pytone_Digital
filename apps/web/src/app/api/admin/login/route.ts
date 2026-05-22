// POST /api/admin/login  { username, password }
//
// Verifies the credentials against env-stored scrypt hash, signs an
// HMAC session token, and drops it as an HttpOnly cookie that gates
// /admin/* via middleware.ts.
//
// Required Netlify env vars:
//   ADMIN_USERNAME        e.g. admin@novastream.tv
//   ADMIN_PASSWORD_HASH   scrypt$<salt-hex>$<hash-hex>
//   ADMIN_SESSION_SECRET  random 32+ byte hex string
//
// Login is rate-limited per-process: 5 failed attempts in 5 minutes
// from the same caller (best-effort across one Netlify Function
// instance) puts the username on cool-down. Real production should
// move this to Redis/Upstash.

import { NextRequest, NextResponse } from 'next/server';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { signAdminToken, ADMIN_COOKIE } from '@/lib/adminSession';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body { username?: string; password?: string }

const FAILS: Map<string, number[]> = new Map();
const LIMIT = 5;
const WINDOW_MS = 5 * 60_000;

function tooManyFails(key: string): boolean {
  const now = Date.now();
  const arr = (FAILS.get(key) || []).filter((t) => now - t < WINDOW_MS);
  FAILS.set(key, arr);
  return arr.length >= LIMIT;
}
function recordFail(key: string) {
  const arr = FAILS.get(key) || [];
  arr.push(Date.now());
  FAILS.set(key, arr);
}

function verifyPassword(plain: string, stored: string): boolean {
  // stored: scrypt$<saltHex>$<hashHex>
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(hashHex, 'hex');
    const got = scryptSync(plain, Buffer.from(saltHex, 'hex'), expected.length, { N: 16384, r: 8, p: 1 });
    if (got.length !== expected.length) return false;
    return timingSafeEqual(got, expected);
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  const ADMIN_USERNAME       = process.env.ADMIN_USERNAME;
  const ADMIN_PASSWORD_HASH  = process.env.ADMIN_PASSWORD_HASH;
  const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET;
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH || !ADMIN_SESSION_SECRET) {
    console.warn('[admin/login] env not configured');
    return NextResponse.json({ error: 'Admin login is unavailable.' }, { status: 503 });
  }
  if (ADMIN_SESSION_SECRET.length < 32) {
    console.warn('[admin/login] ADMIN_SESSION_SECRET too short');
    return NextResponse.json({ error: 'Admin login is unavailable.' }, { status: 503 });
  }

  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON body required.' }, { status: 400 }); }
  const username = (body.username || '').trim().toLowerCase();
  const password = body.password || '';
  if (!username || !password) return NextResponse.json({ error: 'Username and password required.' }, { status: 400 });

  // Bucket lockout by the username so an attacker can't tar-pit other
  // accounts. (We have only one admin today; this is forward-looking.)
  if (tooManyFails(username)) {
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 });
  }

  // Constant-time username compare — we don't want a timing oracle
  // that reveals whether the username is right.
  const userOk =
    Buffer.byteLength(username) === Buffer.byteLength(ADMIN_USERNAME) &&
    timingSafeEqual(Buffer.from(username), Buffer.from(ADMIN_USERNAME.toLowerCase()));

  const passOk = verifyPassword(password, ADMIN_PASSWORD_HASH);
  if (!userOk || !passOk) {
    recordFail(username);
    // Add a tiny random delay so timing differences between branches
    // are buried in noise.
    await new Promise((r) => setTimeout(r, 80 + (randomBytes(1)[0] & 0x3f)));
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  const token = await signAdminToken(ADMIN_USERNAME, ADMIN_SESSION_SECRET);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure:   true,
    sameSite: 'lax',
    path:     '/',
    maxAge:   8 * 3600,
  });
  return res;
}
