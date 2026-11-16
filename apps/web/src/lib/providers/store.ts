// Per-user provider connections, encrypted at rest.
//
// KV key `providers:<userId>` holds ONE secretBox-sealed JSON array
// (bound to the user id). Credentials are never stored in plaintext and
// never returned to the browser: publicView() strips them.
//
// Saving requires NOVA_ENCRYPTION_KEY — without it, adding a provider
// fails with EncryptionNotConfiguredError rather than storing secrets in
// the clear.

import type { KVNamespace } from '../cfEnv';
import { open, seal, needsReseal } from '../secretBox';
import type { AccountInfo, Capabilities, ProviderType } from './types';
import type { ProviderConfig } from './index';

export const MAX_PROVIDERS = 10;

export interface ProviderRecord {
  id:           string;
  type:         ProviderType;
  name:         string;
  createdAt:    number;
  config:       ProviderConfig;
  capabilities: Capabilities;
  account:      AccountInfo | null;
  checkedAt:    number;
}

export interface PublicProvider {
  id: string; type: ProviderType; name: string; createdAt: number;
  capabilities: Capabilities; account: AccountInfo | null; checkedAt: number;
  /** Where it points, with no secrets: host, and a masked user / MAC. */
  label: string;
}

const key = (userId: string) => `providers:${userId}`;
const aad = (userId: string) => `providers:${userId}`;

export async function listProviders(kv: KVNamespace, userId: string): Promise<ProviderRecord[]> {
  const raw = await kv.get(key(userId));
  if (!raw) return [];
  const json = await open(raw, aad(userId));
  if (json === null) throw new Error('provider store cannot be decrypted (encryption key missing or rotated out)');
  const list = JSON.parse(json) as ProviderRecord[];
  if (await needsReseal(raw)) await saveProviders(kv, userId, list);   // finish a key rotation
  return list;
}

export async function saveProviders(kv: KVNamespace, userId: string, list: ProviderRecord[]): Promise<void> {
  if (list.length === 0) { await kv.delete(key(userId)); return; }
  await kv.put(key(userId), await seal(JSON.stringify(list), aad(userId)));
}

export async function getProvider(kv: KVNamespace, userId: string, id: string): Promise<ProviderRecord | null> {
  return (await listProviders(kv, userId)).find((p) => p.id === id) ?? null;
}

function mask(s: string): string {
  if (s.length <= 2) return '•'.repeat(s.length);
  return s[0] + '•'.repeat(Math.min(6, s.length - 2)) + s[s.length - 1];
}

export function publicView(p: ProviderRecord): PublicProvider {
  const cfg = p.config as unknown as Record<string, string>;
  let label = '';
  try {
    if (p.type === 'xtream') label = `${new URL(cfg.server).host} · ${mask(cfg.username)}`;
    else label = `${new URL(cfg.portal).host} · ${cfg.mac.slice(0, 8)}:••:••:••`;
  } catch { label = p.type; }
  return { id: p.id, type: p.type, name: p.name, createdAt: p.createdAt, capabilities: p.capabilities, account: p.account, checkedAt: p.checkedAt, label };
}
