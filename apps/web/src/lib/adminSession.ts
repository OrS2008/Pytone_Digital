// Admin session — HMAC-signed cookie that gates /admin/* routes.
//
// Cookie wire format:  base64url(payload).base64url(signature)
//   payload  = JSON { sub, iat, exp }
//   signature = HMAC-SHA256(payload, ADMIN_SESSION_SECRET)
//
// Verification runs both in Node API routes (the login handler) and
// the Edge middleware that protects /admin/*, so this helper sticks to
// the Web Crypto API which is available in both runtimes.
//
// Lifetime: 8 hours. Admins re-authenticate after a working day so a
// laptop left open doesn't stay an admin session forever.

const ENC = new TextEncoder();
const DEC = new TextDecoder();

// Web Crypto wants BufferSource backed by a real ArrayBuffer; on strict
// TS configs TextEncoder.encode() returns Uint8Array<ArrayBufferLike>
// (which could be SharedArrayBuffer). Copy through a fresh
// ArrayBuffer so the type narrows.
function asBuf(u8: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(u8.byteLength);
  new Uint8Array(ab).set(u8);
  return ab;
}

function strBytes(s: string): ArrayBuffer { return asBuf(ENC.encode(s)); }

function b64uEnc(bytes: ArrayBuffer | Uint8Array | string): string {
  const u8 =
    typeof bytes === 'string'      ? ENC.encode(bytes) :
    bytes instanceof Uint8Array    ? bytes :
                                     new Uint8Array(bytes);
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDec(s: string): ArrayBuffer {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const t = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t);
  const ab = new ArrayBuffer(bin.length);
  const v = new Uint8Array(ab);
  for (let i = 0; i < bin.length; i++) v[i] = bin.charCodeAt(i);
  return ab;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    strBytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export interface AdminClaims {
  sub: string;
  iat: number;
  exp: number;
}

export async function signAdminToken(sub: string, secret: string, ttlSec = 8 * 3600): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: AdminClaims = { sub, iat: now, exp: now + ttlSec };
  const payload = b64uEnc(JSON.stringify(claims));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, strBytes(payload));
  return `${payload}.${b64uEnc(sig)}`;
}

export async function verifyAdminToken(token: string, secret: string): Promise<AdminClaims | null> {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  let key: CryptoKey;
  try { key = await hmacKey(secret); } catch { return null; }
  const ok = await crypto.subtle.verify('HMAC', key, b64uDec(sig), strBytes(payload));
  if (!ok) return null;
  let claims: AdminClaims;
  try { claims = JSON.parse(DEC.decode(new Uint8Array(b64uDec(payload)))) as AdminClaims; } catch { return null; }
  if (!claims.exp || claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims;
}

export const ADMIN_COOKIE = 'ns_admin';
