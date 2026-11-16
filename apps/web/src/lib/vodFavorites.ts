'use client';

// "My list" for movies and series. Stored per account under a synced
// key (see serverSync SYNCED_KEYS), so it follows the user to every
// device through the encrypted settings blob.

import { userKey } from './session';

export interface VodFavorite {
  key:      string;              // `${provider}:${kind}:${id}`
  provider: string;
  kind:     'movie' | 'series';
  id:       string;
  name:     string;
  poster:   string;
  ext?:     string;              // movies: container for playback
  at:       number;
}

const KEY = 'vod.favorites';
const MAX = 200;

function read(): Record<string, VodFavorite> {
  if (typeof window === 'undefined') return {};
  try {
    const v = JSON.parse(localStorage.getItem(userKey(KEY)) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

function write(all: Record<string, VodFavorite>) {
  const trimmed = Object.values(all).sort((a, b) => b.at - a.at).slice(0, MAX);
  try {
    localStorage.setItem(userKey(KEY), JSON.stringify(Object.fromEntries(trimmed.map((f) => [f.key, f]))));
    window.dispatchEvent(new Event('ns-vod-favorites'));
  } catch { /* storage unavailable */ }
}

export const favKey = (provider: string, kind: string, id: string) => `${provider}:${kind}:${id}`;

export function isFavorite(key: string): boolean { return !!read()[key]; }

export function toggleFavorite(f: Omit<VodFavorite, 'key' | 'at'>): boolean {
  const all = read();
  const key = favKey(f.provider, f.kind, f.id);
  if (all[key]) { delete all[key]; write(all); return false; }
  all[key] = { ...f, key, at: Date.now() };
  write(all);
  return true;
}

export function listFavorites(provider: string | null, kind?: 'movie' | 'series'): VodFavorite[] {
  return Object.values(read())
    .filter((f) => (!provider || f.provider === provider) && (!kind || f.kind === kind))
    .sort((a, b) => b.at - a.at);
}

export function onFavoritesChange(cb: () => void): () => void {
  window.addEventListener('ns-vod-favorites', cb);
  window.addEventListener('ns-settings-synced', cb);
  return () => { window.removeEventListener('ns-vod-favorites', cb); window.removeEventListener('ns-settings-synced', cb); };
}
