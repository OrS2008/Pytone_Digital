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
import { getEnv } from '@/lib/envFallback';

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
  // Accepted formats:
  //   "scrypt$<saltHex>$<hashHex>"   ← legacy
  //   "scrypt:<saltHex>:<hashHex>"   ← preferred
  //
  // Why both: dotenv interprets `$` in .env files as variable
  // expansion ($FOO → process.env.FOO). A scrypt hash full of hex
  // happily contains "$<hex>" sequences which expand to empty and
  // silently truncate the stored value to literally "scrypt". The
  // colon-delimited form sidesteps that without needing to quote
  // values in .env. Legacy hashes still verify so existing deploys
  // keep working until the operator re-rotates.
  // (If you write the legacy form in .env.local, wrap the whole
  // value in single quotes: ADMIN_PASSWORD_HASH='scrypt$abc$def')
  const sep = stored.includes(':') ? ':' : '$';
  const [scheme, saltHex, hashHex] = stored.split(sep);
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
  // getEnv() reads process.env first, then falls back to .env.local
  // on disk if the value looks mangled. Specifically defends against
  // dotenv expanding $-delimited segments in ADMIN_PASSWORD_HASH.
  const ADMIN_USERNAME       = getEnv('ADMIN_USERNAME');
  const ADMIN_PASSWORD_HASH  = getEnv('ADMIN_PASSWORD_HASH');
  const ADMIN_SESSION_SECRET = getEnv('ADMIN_SESSION_SECRET');
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
    // Debug logging — surface what the server actually sees so a
    // 401 in development is diagnosable without guesswork. Strips
    // most of the hash so secrets don't leak, but enough to verify
    // file vs runtime sync. Remove once the deploy stabilises.
    if (process.env.NODE_ENV !== 'production') {
      const envHashHead = ADMIN_PASSWORD_HASH.slice(0, 60);
      console.warn('[admin/login] 401 — userOk=' + userOk + ' passOk=' + passOk);
      console.warn('[admin/login]   sent username : ' + JSON.stringify(username));
      console.warn('[admin/login]   env  username : ' + JSON.stringify(ADMIN_USERNAME.toLowerCase()));
      console.warn('[admin/login]   sent pw length: ' + password.length);
      console.warn('[admin/login]   env  hash head: ' + envHashHead + '…');
      try {
        const parts = ADMIN_PASSWORD_HASH.split('$');
        if (parts.length === 3) {
          const expected = Buffer.from(parts[2], 'hex');
          const got = scryptSync(password, Buffer.from(parts[1], 'hex'), expected.length, { N: 16384, r: 8, p: 1 });
          console.warn('[admin/login]   computed head: scrypt$' + parts[1].slice(0, 12) + '…$' + got.toString('hex').slice(0, 40) + '…');
          console.warn('[admin/login]   stored   head: scrypt$' + parts[1].slice(0, 12) + '…$' + parts[2].slice(0, 40) + '…');
        }
      } catch { /* ignore */ }
    }
    recordFail(username);
    await new Promise((r) => setTimeout(r, 80 + (randomBytes(1)[0] & 0x3f)));
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  const token = await signAdminToken(ADMIN_USERNAME, ADMIN_SESSION_SECRET);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    // Secure-flag cookies are rejected over plain http://, which is how
    // dev runs locally. Drop the flag in development so the cookie is
    // accepted on http://localhost; keep it on in production where the
    // deploy is always served over https.
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   8 * 3600,
  });
  return res;
}
