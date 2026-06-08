// "Pre-verification" handle — bridges signup and the verification
// click without forcing the user to re-enter their password to resend
// the email.
//
// Why this exists: Firebase's sendOobCode(VERIFY_EMAIL) needs an
// idToken (proof of identity). After signup we have one. After the
// user closes the signup tab and opens /tv/check-email later, we
// don't — and we can't get a new one without the password. The
// admin SDK could mint one out of nowhere but isn't available on the
// edge runtime.
//
// Workaround: stash the freshly-issued refresh token in KV, hand the
// browser an opaque single-use lookup key in an HTTP-only cookie, and
// trade the cookie for a fresh idToken whenever the user clicks
// "Resend verification email". Refresh tokens don't carry an
// expiry, so this keeps working until the user verifies (we drop the
// row + cookie at that point) or 24 hours pass (KV TTL).

import type { KVNamespace } from '../cfEnv';

const COOKIE = 'ns_preverify';
const KV_PREFIX = 'preverify:';
const TTL_SEC = 24 * 60 * 60;

interface StoredHandle {
  email:         string;
  refreshToken:  string;
  createdAt:     number;
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createPreverifyHandle(
  kv: KVNamespace,
  email: string,
  refreshToken: string,
): Promise<string> {
  const token = randomToken();
  const stored: StoredHandle = { email, refreshToken, createdAt: Date.now() };
  await kv.put(`${KV_PREFIX}${token}`, JSON.stringify(stored), { expirationTtl: TTL_SEC });
  return token;
}

export async function readPreverifyHandle(
  kv: KVNamespace,
  token: string,
): Promise<StoredHandle | null> {
  if (!token) return null;
  const raw = await kv.get(`${KV_PREFIX}${token}`);
  if (!raw) return null;
  try { return JSON.parse(raw) as StoredHandle; } catch { return null; }
}

export async function deletePreverifyHandle(kv: KVNamespace, token: string): Promise<void> {
  if (!token) return;
  try { await kv.delete(`${KV_PREFIX}${token}`); } catch { /* best-effort */ }
}

// Cookie shape mirrors lib/auth/serverSession's session cookie — same
// flags, same parsing pattern. HTTP-only so client JS can't read or
// leak the handle. SameSite=Lax so a top-level navigation from the
// verification email lands with the cookie attached (Strict would
// nuke it).
export function setPreverifyCookieHeader(token: string): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_SEC}`;
}

export function clearPreverifyCookieHeader(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function readPreverifyCookie(req: Request): string {
  const raw = req.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === COOKIE && v) return v;
  }
  return '';
}
