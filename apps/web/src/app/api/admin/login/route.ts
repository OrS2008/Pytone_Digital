// POST /api/admin/login  { username, password }
//
// Verifies credentials against env-stored PBKDF2 hash, signs an HMAC
// session token, and drops it as an HttpOnly cookie that gates
// /admin/* via middleware.ts.
//
// Runs on the Cloudflare edge runtime, so all crypto is Web Crypto
// (no node:crypto). Password hashing uses PBKDF2-SHA256 because it's
// the only password-grade KDF exposed by SubtleCrypto.
//
// Required env vars:
//   ADMIN_USERNAME        e.g. admin@novastream.tv
//   ADMIN_PASSWORD_HASH   pbkdf2:<iterations>:<saltHex>:<hashHex>
//   ADMIN_SESSION_SECRET  random 32+ byte hex string
//
// Generate the password hash with apps/web/scripts/hash-admin-password.mjs.

import { NextRequest, NextResponse } from 'next/server';
import { signAdminToken, ADMIN_COOKIE } from '@/lib/adminSession';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

interface Body { username?: string; password?: string }

// Per-instance rate limit. Best-effort across one isolate; Cloudflare
// may spawn several, so this is a tar-pit and not a hard guarantee —
// real production should move to Durable Objects or KV.
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

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// Constant-time byte comparison. The lengths are compared first
// because Uint8Array.length is public; mismatched-length inputs
// can short-circuit without leaking the secret.
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number, lengthBytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    lengthBytes * 8,
  );
  return new Uint8Array(bits);
}

async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  // Format: "pbkdf2:<iterations>:<saltHex>:<hashHex>"
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = parseInt(parts[1], 10);
  if (!iterations || iterations < 10_000) return false;
  try {
    const salt     = hexToBytes(parts[2]);
    const expected = hexToBytes(parts[3]);
    const got = await pbkdf2(plain, salt, iterations, expected.length);
    return constantTimeEqual(got, expected);
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  try {
    return await handleLogin(req);
  } catch (e) {
    // Always return JSON so the frontend can surface the real error
    // instead of falling back to a generic "Sign in failed."
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `login crashed: ${msg}` }, { status: 500 });
  }
}

async function handleLogin(req: NextRequest) {
  const ADMIN_USERNAME       = process.env.ADMIN_USERNAME;
  const ADMIN_PASSWORD_HASH  = process.env.ADMIN_PASSWORD_HASH;
  const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET;
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH || !ADMIN_SESSION_SECRET) {
    const missing = [
      !ADMIN_USERNAME       && 'ADMIN_USERNAME',
      !ADMIN_PASSWORD_HASH  && 'ADMIN_PASSWORD_HASH',
      !ADMIN_SESSION_SECRET && 'ADMIN_SESSION_SECRET',
    ].filter(Boolean).join(', ');
    return NextResponse.json({
      error: `Admin login is not configured. Missing: ${missing}`,
      hint:  'Add the variables under Cloudflare Pages → Settings → Variables and Secrets, then redeploy.',
    }, { status: 503 });
  }
  if (ADMIN_SESSION_SECRET.length < 32) {
    return NextResponse.json({ error: 'ADMIN_SESSION_SECRET must be at least 32 chars.' }, { status: 503 });
  }

  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON body required.' }, { status: 400 }); }
  const username = (body.username || '').trim().toLowerCase();
  const password = body.password || '';
  if (!username || !password) return NextResponse.json({ error: 'Username and password required.' }, { status: 400 });

  if (tooManyFails(username)) {
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 });
  }

  const enc = new TextEncoder();
  const userBytes = enc.encode(username);
  const envBytes  = enc.encode(ADMIN_USERNAME.toLowerCase());
  const userOk = constantTimeEqual(userBytes, envBytes);
  const passOk = await verifyPassword(password, ADMIN_PASSWORD_HASH);

  if (!userOk || !passOk) {
    recordFail(username);
    // Small randomised delay to blunt online guessing without giving
    // a precise oracle on which check failed.
    const jitter = crypto.getRandomValues(new Uint8Array(1))[0] & 0x3f;
    await new Promise((r) => setTimeout(r, 80 + jitter));
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  const token = await signAdminToken(ADMIN_USERNAME, ADMIN_SESSION_SECRET);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    // sameSite=strict prevents the cookie from riding along on any
    // cross-site navigation, including link clicks from email. For an
    // admin surface the friction is the right trade-off: a phishing
    // page can't redirect an authenticated admin into a CSRF flow.
    sameSite: 'strict',
    path:     '/',
    maxAge:   8 * 3600,
  });
  return res;
}
