// Shared cache for the user's parsed playlist.
//
// /tv/live and /tv/search and /tv home all want the same set of
// channels. Previously each route re-fetched and re-parsed the M3U on
// every mount — that's why the user saw "demo channels" flash before
// their real playlist loaded.
//
// Caching strategy:
//   1. In-memory Map (per session, per tab, per user). First hit fills
//      it from /api/m3u; everything after is synchronous.
//   2. sessionStorage mirror so a hard reload within the same tab is
//      still instant — we trust the local-cache for up to MAX_AGE_MS.
//   3. We deliberately do NOT use localStorage for the parsed channel
//      list. Playlists can be hundreds of KB; the per-origin
//      localStorage budget is small and we'd starve other features.
//
// All keys are namespaced by tenant via userKey() so two accounts on
// the same browser still see two completely separate lists.

import type { M3UChannel } from './m3u';
import { parseM3U } from './m3u';
import { userKey } from './session';

interface StoredSource { id: string; kind: string; title: string; sub: string; stat: string }

interface CacheEntry {
  url:         string;          // the M3U URL we parsed
  fetchedAt:   number;
  channels:    M3UChannel[];
}

const MAX_AGE_MS = 30 * 60_000;
// In-memory cache, keyed by tenant id (so two tenants on the same
// browser tab don't bleed across each other). Module-level Map
// survives SPA navigation between routes.
const MEM: Map<string, CacheEntry> = new Map();

function memKey(): string {
  // Mirror the user-keyed namespacing we use in localStorage.
  return userKey('channels');
}

function readSessionCache(): CacheEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(memKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (Date.now() - parsed.fetchedAt > MAX_AGE_MS) return null;
    return parsed;
  } catch { return null; }
}

function writeSessionCache(entry: CacheEntry) {
  if (typeof window === 'undefined') return;
  try { sessionStorage.setItem(memKey(), JSON.stringify(entry)); } catch { /* quota */ }
}

// Returns the cached channels synchronously if we have anything for
// the active tenant. Used by every route to render the user's list
// instantly on mount.
export function getCachedChannels(): M3UChannel[] | null {
  const key = memKey();
  const mem = MEM.get(key);
  if (mem) return mem.channels;
  const sess = readSessionCache();
  if (sess) { MEM.set(key, sess); return sess.channels; }
  return null;
}

// Returns the user's saved live-source URL, or null if they haven't
// configured one. Resolved synchronously from localStorage.
export function getUserSourceUrl(): { url: string; title: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(userKey('sources.live'));
    if (!raw) return null;
    const list = JSON.parse(raw) as StoredSource[];
    const src = list.find((s) => s.id !== 'live-1' && (s.sub.startsWith('http://') || s.sub.startsWith('https://')));
    return src ? { url: src.sub, title: src.title || 'My playlist' } : null;
  } catch { return null; }
}

// Fetch + parse + cache. Idempotent in flight — concurrent callers
// share a single in-flight promise.
const INFLIGHT: Map<string, Promise<M3UChannel[]>> = new Map();

export async function loadChannels(): Promise<M3UChannel[]> {
  const cached = getCachedChannels();
  if (cached && cached.length > 0) return cached;

  const src = getUserSourceUrl();
  if (!src) return [];

  const flightKey = memKey() + '|' + src.url;
  const existing = INFLIGHT.get(flightKey);
  if (existing) return existing;

  const p = (async () => {
    try {
      const r = await fetch('/api/m3u?url=' + encodeURIComponent(src.url));
      if (!r.ok) return [];
      const text = await r.text();
      const channels = parseM3U(text);
      if (channels.length > 0) {
        const entry: CacheEntry = { url: src.url, fetchedAt: Date.now(), channels };
        MEM.set(memKey(), entry);
        writeSessionCache(entry);
      }
      return channels;
    } catch {
      return [];
    } finally {
      INFLIGHT.delete(flightKey);
    }
  })();

  INFLIGHT.set(flightKey, p);
  return p;
}

export function invalidateCache() {
  const key = memKey();
  MEM.delete(key);
  if (typeof window === 'undefined') return;
  try { sessionStorage.removeItem(key); } catch { /* ignore */ }
}
