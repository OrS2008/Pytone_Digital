// Server-side authenticated encryption for secrets at rest and for
// opaque tokens handed to the browser.
//
// AES-256-GCM via WebCrypto (available on Cloudflare's edge and in
// Node). The key never reaches the client.
//
// Keys come from the environment — never from source:
//   NOVA_ENCRYPTION_KEY           32 random bytes, base64 or hex  (required)
//   NOVA_ENCRYPTION_KEY_PREVIOUS  the key being rotated out        (optional)
//
// Rotation: move the current key to _PREVIOUS, put a new one in
// NOVA_ENCRYPTION_KEY, redeploy. Old ciphertexts still open (they carry
// the id of the key that sealed them) and are re-sealed with the new
// key the next time they are written.
//
// Format:  nsb1.<keyId>.<iv>.<ciphertext>   (base64url parts)
//
// `aad` binds a ciphertext to its context (e.g. the owning user id), so
// a blob copied from one account into another fails to open.

const PREFIX = 'nsb1';

export class EncryptionNotConfiguredError extends Error {
  constructor() {
    super('NOVA_ENCRYPTION_KEY is not set (32 random bytes, base64 or hex).');
    this.name = 'EncryptionNotConfiguredError';
  }
}

interface LoadedKey { id: string; key: CryptoKey }
const cache = new Map<string, Promise<LoadedKey | null>>();

function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function parseKeyMaterial(raw: string): Uint8Array<ArrayBuffer> | null {
  const v = raw.trim();
  if (/^[0-9a-f]{64}$/i.test(v)) {
    const out = new Uint8Array(new ArrayBuffer(32));
    for (let i = 0; i < 32; i++) out[i] = parseInt(v.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  try {
    const b = b64urlDecode(v.replace(/=+$/, ''));
    return b.length === 32 ? b : null;
  } catch { return null; }
}

function loadKey(raw: string | undefined): Promise<LoadedKey | null> {
  if (!raw) return Promise.resolve(null);
  let p = cache.get(raw);
  if (!p) {
    p = (async () => {
      const material = parseKeyMaterial(raw);
      if (!material) throw new Error('Encryption key must be exactly 32 bytes (base64 or 64 hex chars).');
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', material));
      const id = b64urlEncode(digest.slice(0, 6));
      const key = await crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
      return { id, key };
    })();
    cache.set(raw, p);
  }
  return p;
}

function env(name: string): string | undefined {
  try { return (process.env as Record<string, string | undefined>)[name] || undefined; }
  catch { return undefined; }
}

export function isEncryptionConfigured(): boolean {
  return !!env('NOVA_ENCRYPTION_KEY');
}

export function isSealed(value: string): boolean {
  return value.startsWith(PREFIX + '.');
}

/** Encrypt `plaintext`. Throws EncryptionNotConfiguredError without a key. */
export async function seal(plaintext: string, aad = ''): Promise<string> {
  const k = await loadKey(env('NOVA_ENCRYPTION_KEY'));
  if (!k) throw new EncryptionNotConfiguredError();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad) },
    k.key,
    new TextEncoder().encode(plaintext),
  ));
  return `${PREFIX}.${k.id}.${b64urlEncode(iv)}.${b64urlEncode(ct)}`;
}

/** Decrypt a value from seal(). Returns null if it is malformed, tampered
 *  with, sealed under an unknown key, or bound to a different `aad`. */
export async function open(token: string, aad = ''): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  const [, kid, ivPart, ctPart] = parts;
  for (const name of ['NOVA_ENCRYPTION_KEY', 'NOVA_ENCRYPTION_KEY_PREVIOUS']) {
    let k: LoadedKey | null;
    try { k = await loadKey(env(name)); } catch { k = null; }
    if (!k || k.id !== kid) continue;
    try {
      const pt = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: b64urlDecode(ivPart), additionalData: new TextEncoder().encode(aad) },
        k.key,
        b64urlDecode(ctPart),
      );
      return new TextDecoder().decode(pt);
    } catch { return null; }
  }
  return null;
}

/** True when `token` was sealed with a key other than the current one. */
export async function needsReseal(token: string): Promise<boolean> {
  const k = await loadKey(env('NOVA_ENCRYPTION_KEY')).catch(() => null);
  const kid = token.split('.')[1];
  return !!k && kid !== k.id;
}
