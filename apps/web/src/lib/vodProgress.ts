'use client';

// Resume positions and "continue watching" for movies and episodes.
// Stored per account in localStorage under a synced key (see
// serverSync SYNCED_KEYS), so it follows the user to other devices
// through the encrypted settings blob.

import { userKey } from './session';

export interface Progress {
  key:      string;              // `${providerId}:${kind}:${id}`
  provider: string;
  kind:     'movie' | 'episode';
  id:       string;
  ext:      string;
  title:    string;
  poster:   string;
  position: number;              // seconds
  duration: number;              // seconds
  at:       number;              // epoch ms
  seriesId?: string;
  season?:   number;
  episode?:  number;
}

const KEY = 'vod.progress';
const MAX = 60;

function read(): Record<string, Progress> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(userKey(KEY));
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

export const progressKey = (provider: string, kind: string, id: string) => `${provider}:${kind}:${id}`;

export function getProgress(key: string): Progress | null { return read()[key] ?? null; }

export function saveProgress(p: Progress): void {
  const all = read();
  // Finished (≥ 95 %) titles leave "continue watching".
  if (p.duration > 0 && p.position / p.duration >= 0.95) delete all[p.key];
  else if (p.position >= 10) all[p.key] = p;
  const trimmed = Object.values(all).sort((a, b) => b.at - a.at).slice(0, MAX);
  try {
    localStorage.setItem(userKey(KEY), JSON.stringify(Object.fromEntries(trimmed.map((x) => [x.key, x]))));
    window.dispatchEvent(new Event('ns-vod-progress'));
  } catch { /* storage full / unavailable */ }
}

export function continueWatching(provider: string | null, kind?: 'movie' | 'episode'): Progress[] {
  return Object.values(read())
    .filter((p) => (!provider || p.provider === provider) && (!kind || p.kind === kind))
    .sort((a, b) => b.at - a.at);
}
