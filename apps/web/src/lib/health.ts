// Dependency checks shared by /api/health (public, minimal) and
// /api/admin/diag (admin, detailed). Reports presence/working state only —
// never a secret's value.

import { getKV } from './cfEnv';
import { isEncryptionConfigured, seal, open } from './secretBox';

export interface Check { ok: boolean; ms?: number; detail?: string }

export async function checkKV(): Promise<Check> {
  const kv = getKV();
  if (!kv) return { ok: false, detail: 'NOVA_KV binding missing' };
  const t0 = Date.now();
  const key = `health:${crypto.randomUUID()}`;
  try {
    await kv.put(key, '1', { expirationTtl: 60 });
    const v = await kv.get(key);
    await kv.delete(key).catch(() => {});
    return { ok: v === '1', ms: Date.now() - t0, detail: v === '1' ? undefined : 'read-after-write mismatch' };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, detail: (e as Error).name };
  }
}

export async function checkEncryption(): Promise<Check> {
  if (!isEncryptionConfigured()) return { ok: false, detail: 'NOVA_ENCRYPTION_KEY not set' };
  try {
    const ok = (await open(await seal('probe', 'health'), 'health')) === 'probe';
    return { ok, detail: ok ? undefined : 'round-trip failed' };
  } catch (e) {
    return { ok: false, detail: (e as Error).message.includes('32 bytes') ? 'key is not 32 bytes' : 'key unusable' };
  }
}

const has = (name: string) => !!(process.env as Record<string, string | undefined>)[name];

export function configChecks(): Record<string, Check> {
  return {
    stripe:          { ok: has('STRIPE_SECRET_KEY') && has('STRIPE_WEBHOOK_SECRET'), detail: has('STRIPE_SECRET_KEY') ? (has('STRIPE_WEBHOOK_SECRET') ? undefined : 'webhook secret missing') : 'STRIPE_SECRET_KEY missing' },
    stripePrices:    { ok: ['STRIPE_PRICE_SINGLE_MONTHLY', 'STRIPE_PRICE_SINGLE_YEARLY', 'STRIPE_PRICE_MULTI_MONTHLY', 'STRIPE_PRICE_MULTI_YEARLY'].every(has) },
    firebase:        { ok: has('FIREBASE_API_KEY') },
    googleSignIn:    { ok: has('GOOGLE_CLIENT_ID') || has('NEXT_PUBLIC_GOOGLE_CLIENT_ID') },
    adminLogin:      { ok: has('ADMIN_USERNAME') && has('ADMIN_PASSWORD_HASH') && ((process.env.ADMIN_SESSION_SECRET || '').length >= 32) },
    keyRotation:     { ok: true, detail: has('NOVA_ENCRYPTION_KEY_PREVIOUS') ? 'previous key present (rotation in progress)' : undefined },
  };
}
