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
  url:       string;          // the M3U URL we parsed
  fetchedAt: number;
  channels:  M3UChannel[];
  /** parseM3U revision that produced `channels` — see PARSE_VERSION. */
  v?:        number;
}

// What is cached here is the OUTPUT of parseM3U, not the playlist text.
// That means a fix to the parser does not reach anyone holding a warm
// cache until it ages out, and for up to MAX_AGE_MS they keep seeing
// results the old code produced — with no way to tell why. That is
// exactly what happened when the EXTINF comma split was fixed: the
// deploy was live, but channels kept rendering with user-agent
// fragments for their names because the entry predating the fix was
// still being served.
//
// Bump this whenever parseM3U's output changes in a way that should be
// visible immediately. Entries stamped with an older revision are
// treated as a miss and re-parsed from the playlist.
const PARSE_VERSION = 2;

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
    if (parsed.v !== PARSE_VERSION) return null;
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
// The entry is only valid if it was parsed from the playlist that is
// configured right now. A source change this tab didn't perform —
// most commonly syncDown() rewriting the synced `sources.live` key
// from another device — otherwise left the previous playlist on
// screen until the 30-minute TTL lapsed. Callers that already know
// the URL can pass it to skip the localStorage re-read; everyone else
// gets the check for free, which matters because these call sites
// paint synchronously before the async reload lands.
// loadEpgIndex has always compared its stored url this way.
export function getCachedChannels(forUrl?: string): M3UChannel[] | null {
  const wanted = forUrl ?? getUserSourceUrl()?.url;
  const fresh = (e: CacheEntry) =>
    (e.v === PARSE_VERSION && (wanted == null || e.url === wanted)) ? e.channels : null;
  const key = memKey();
  const mem = MEM.get(key);
  if (mem) return fresh(mem);
  const sess = readSessionCache();
  if (sess) { MEM.set(key, sess); return fresh(sess); }
  return null;
}

// Returns the user's saved live-source URL, or null if they haven't
// configured one. Resolved synchronously from localStorage.
//
// We pick the first entry whose `sub` looks like a real, reachable URL —
// http(s), and not the demo template (`provider.example` / bullet-masked
// credentials). Previously we keyed off `id !== 'live-1'`, which broke
// the moment the user clicked "Edit" on the placeholder row to paste
// their real URL: the id stayed `live-1`, so we silently ignored their
// configuration and they kept seeing the mock channels.
export function getUserSourceUrl(): { url: string; title: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(userKey('sources.live'));
    if (!raw) return null;
    const list = JSON.parse(raw) as StoredSource[];
    const src = list.find((s) => isRealLiveSourceUrl(s.sub));
    return src ? { url: src.sub, title: src.title || 'My playlist' } : null;
  } catch { return null; }
}

// A URL is "real" (i.e. worth attempting to fetch) when it's http(s),
// OR a local: handle pointing at an uploaded file's localStorage entry.
// Local uploads bypass /api/m3u entirely (the file is already on the
// client), so we recognise the local: prefix here too.
function isRealLiveSourceUrl(sub: string): boolean {
  if (!sub) return false;
  if (/^local:[a-z0-9-]+$/i.test(sub)) return true;
  if (!/^https?:\/\//i.test(sub)) return false;
  if (/provider\.example/i.test(sub)) return false;
  if (/•/.test(sub)) return false; // masked-credential placeholder
  return true;
}

// Storage key for an uploaded M3U file's raw text. We split file
// uploads off from sessionStorage (which we use for the parsed
// channels) and into localStorage so an uploaded playlist survives
// browser restarts — the user didn't fetch it from anywhere, so
// dropping it on reload would mean re-uploading the same file.
export function localM3UKey(id: string): string {
  return userKey('m3u.local.' + id);
}

// Outcome of a load attempt. UIs that just want channels can call
// loadChannels(); UIs that need to show an error message to the user
// (Sources page, /tv/live empty state) call loadChannelsResult().
export interface LoadResult {
  channels: M3UChannel[];
  error?:   string;
}

// Fetch + parse + cache. Idempotent in flight — concurrent callers
// share a single in-flight promise.
const INFLIGHT: Map<string, Promise<LoadResult>> = new Map();

async function fetchAndParse(url: string): Promise<LoadResult> {
  let text: string;

  // local: handles point at a file the user uploaded — already on the
  // client, no proxy round-trip needed.
  if (url.startsWith('local:')) {
    const id = url.slice('local:'.length);
    try {
      text = typeof window !== 'undefined'
        ? (localStorage.getItem(localM3UKey(id)) ?? '')
        : '';
    } catch {
      text = '';
    }
    if (!text) {
      return {
        channels: [],
        error: 'The uploaded playlist isn\'t in browser storage any more. Re-upload the file.',
      };
    }
  } else {
    let r: Response;
    try {
      r = await fetch('/api/m3u?url=' + encodeURIComponent(url));
    } catch (e) {
      return { channels: [], error: `Network error reaching /api/m3u: ${(e as Error).message}` };
    }
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      const trimmed = body.trim().slice(0, 200);
      return { channels: [], error: `Playlist proxy returned ${r.status}${trimmed ? ` — ${trimmed}` : ''}` };
    }
    text = await r.text();
  }

  const channels = parseM3U(text);
  if (channels.length === 0) {
    return {
      channels: [],
      error: 'Playlist contained no channels. The file may be empty or use a non-standard format.',
    };
  }
  const entry: CacheEntry = { url, fetchedAt: Date.now(), channels, v: PARSE_VERSION };
  MEM.set(memKey(), entry);
  writeSessionCache(entry);
  return { channels };
}

// Loads channels for the currently-configured live source. Returns a
// rich result so callers can surface fetch / parse errors instead of
// swallowing them as "no channels".
export async function loadChannelsResult(): Promise<LoadResult> {
  // Resolve the configured source before consulting the cache, so a
  // cache entry parsed from a different playlist is rejected rather
  // than served.
  const src = getUserSourceUrl();
  if (!src) return { channels: [] };  // no source configured — not an error

  const cached = getCachedChannels(src.url);
  if (cached && cached.length > 0) return { channels: cached };

  const flightKey = memKey() + '|' + src.url;
  const existing = INFLIGHT.get(flightKey);
  if (existing) return existing;

  const p = (async () => {
    try {
      return await fetchAndParse(src.url);
    } finally {
      INFLIGHT.delete(flightKey);
    }
  })();

  INFLIGHT.set(flightKey, p);
  return p;
}

// Fetch + parse + cache a specific URL right now. Used by the Sources
// page so "Add & ingest" actually ingests instead of just saving the
// URL to localStorage and hoping a later page mount picks it up.
export async function fetchAndCache(url: string): Promise<LoadResult> {
  invalidateCache();
  return fetchAndParse(url);
}

export async function loadChannels(): Promise<M3UChannel[]> {
  return (await loadChannelsResult()).channels;
}

export function invalidateCache() {
  const key = memKey();
  MEM.delete(key);
  if (typeof window === 'undefined') return;
  try { sessionStorage.removeItem(key); } catch { /* ignore */ }
}
