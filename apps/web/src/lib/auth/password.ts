// Password hashing for the auth API. PBKDF2-SHA256, 100 000 iterations,
// 32-byte salt, 32-byte derived key. PBKDF2 is built into Web Crypto so
// it runs unchanged in the Cloudflare Workers edge runtime; Argon2 would
// require a WASM bundle we don't want to ship.
//
// Why 100k and not OWASP's 600k recommendation? Cloudflare Workers caps
// PBKDF2 iteration counts at 100 000 — anything higher throws "Pbkdf2
// failed: iteration counts above 100000 are not supported". 100k still
// clears NIST SP 800-132's minimum (10 000) by an order of magnitude
// and matches what most edge platforms allow today. If we move auth
// off Workers we can raise this without a user migration — verify()
// reads the iteration count out of the stored hash string.
//
// Stored format: `pbkdf2$100000$<base64-salt>$<base64-hash>`.

const ALGORITHM = 'PBKDF2';
const HASH      = 'SHA-256';
const ITERATIONS = 100_000;
const KEY_LEN   = 32;   // bytes
const SALT_LEN  = 32;   // bytes

function b64encode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: ALGORITHM },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: ALGORITHM, salt: salt as BufferSource, iterations, hash: HASH },
    key,
    KEY_LEN * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${b64encode(salt)}$${b64encode(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1000) return false;
  let salt: Uint8Array, expected: Uint8Array;
  try { salt = b64decode(parts[2]); expected = b64decode(parts[3]); }
  catch { return false; }
  const actual = await pbkdf2(password, salt, iterations);
  // Constant-time compare — early exit on mismatch would leak the
  // index of the first differing byte to a timing attacker.
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

// 32-byte random id, base64url-encoded — used for session ids and the
// internal user id. base64url so the value is URL- and cookie-safe.
export function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return b64encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
