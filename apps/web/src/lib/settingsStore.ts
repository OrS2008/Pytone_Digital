// The per-user settings blob (playlist URLs, EPG URLs, preferences) at
// rest in KV under `settings:<userId>`.
//
// Playlist URLs routinely embed provider usernames and passwords, so the
// blob is encrypted with secretBox, bound to the user id. Reads accept
// both encrypted and legacy plaintext blobs; a legacy blob is encrypted
// the next time the user's settings are saved.
//
// If NOVA_ENCRYPTION_KEY is not configured the blob is stored as before
// (plaintext) and `encrypted: false` is reported, so the admin
// diagnostics can flag it. Nothing in the UI claims encryption.

import type { KVNamespace } from './cfEnv';
import { isEncryptionConfigured, isSealed, open, seal } from './secretBox';

const key = (userId: string) => `settings:${userId}`;
const aad = (userId: string) => `settings:${userId}`;

export async function readSettingsText(kv: KVNamespace, userId: string): Promise<string | null> {
  const raw = await kv.get(key(userId));
  if (raw == null) return null;
  if (!isSealed(raw)) return raw;                 // legacy plaintext
  return open(raw, aad(userId));                  // null if the key is missing / wrong
}

export async function writeSettingsText(kv: KVNamespace, userId: string, json: string): Promise<{ encrypted: boolean }> {
  if (isEncryptionConfigured()) {
    await kv.put(key(userId), await seal(json, aad(userId)));
    return { encrypted: true };
  }
  await kv.put(key(userId), json);
  return { encrypted: false };
}
