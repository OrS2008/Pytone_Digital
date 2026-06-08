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
import { extractM3UUrlTvg, parseM3U } from './m3u';
import { userKey } from './session';

interface StoredSource { id: string; kind: string; title: string; sub: string; stat: string }

interface CacheEntry {
  url:         string;          // the M3U URL we parsed
  fetchedAt:   number;
  channels:    M3UChannel[];
  /** EPG URL the playlist itself referenced via `#EXTM3U url-tvg="…"`,
   *  if any. Surfaced so the EPG diagnostic banner can suggest it
   *  when the user-configured EPG doesn't match. */
  inferredEpgUrl?: string | null;
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
  const inferredEpgUrl = extractM3UUrlTvg(text);
  const entry: CacheEntry = { url, fetchedAt: Date.now(), channels, inferredEpgUrl };
  MEM.set(memKey(), entry);
  writeSessionCache(entry);
  // Auto-configure the EPG source from the playlist's url-tvg
  // attribute. Most users would never know to look for the right
  // EPG URL otherwise — and the M3U header IS the right URL by
  // definition (the provider declared it). We do this silently on
  // every M3U fetch:
  //   * sources.epg empty → add the url-tvg entry
  //   * first entry already matches → no-op
  //   * first entry differs    → replace it
  // The user can still override manually in Sources → EPG; our
  // replacement uses a distinct title ("Provider EPG (auto)") so
  // they can spot it.
  if (inferredEpgUrl) {
    // Fire-and-forget — autoSyncEpgFromM3U awaits the initial
    // syncDown internally before mutating sources.epg, so it can't
    // race the server's GET on first mount.
    void (async () => {
      try { await autoSyncEpgFromM3U(inferredEpgUrl); }
      catch { /* localStorage locked / sync unavailable — ignore */ }
    })();
  }
  return { channels };
}

interface AutoEpgSource { id: string; kind: string; title: string; sub: string; stat: string }

// Only auto-fill the EPG when the user has NOT chosen one themselves.
// The previous version prepended the playlist's url-tvg URL on every
// fetch, which silently demoted a user-set entry and made
// `loadEpgIndex` (which picks the first valid URL) read the auto URL
// instead. Result: users who'd configured a working EPG saw "0
// programmes match" after every refresh.
//
// Rule now: if the list contains ANY entry that wasn't put there by us
// (id !== 'epg-auto-*'), the user is in charge — we don't touch it.
// We also skip when our most recent auto entry already matches the
// inferred URL, so a returning user doesn't churn their settings.
async function autoSyncEpgFromM3U(inferred: string): Promise<void> {
  if (typeof window === 'undefined') return;
  // The boot-time syncDown writes the server's snapshot of
  // localStorage. If we make our own write before it completes, the
  // syncDown response will overwrite us with stale data. Wait for it
  // first so the user's manual EPG (if any) is on disk when we check.
  try {
    const { awaitInitialSyncDown } = await import('./serverSync');
    await awaitInitialSyncDown();
  } catch { /* offline / module unavailable — proceed anyway */ }
  const key = userKey('sources.epg');
  let list: AutoEpgSource[] = [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      try { list = JSON.parse(raw); } catch { list = []; }
      if (!Array.isArray(list)) list = [];
    }
  } catch { /* locked storage */ }

  // Anything with a real http(s) URL that we didn't put there is the
  // user's deliberate choice. The user wins — but as a courtesy, we
  // also evict any stale auto entries from a previous session so the
  // Sources UI doesn't show two competing EPGs side-by-side.
  const hasUserEntry = list.some((s) =>
    s && typeof s.sub === 'string' && /^https?:\/\//i.test(s.sub) &&
    !(s.id || '').startsWith('epg-auto-'),
  );
  if (hasUserEntry) {
    const cleaned = list.filter((s) => !(s.id || '').startsWith('epg-auto-'));
    if (cleaned.length !== list.length) {
      try { localStorage.setItem(key, JSON.stringify(cleaned)); } catch { /* quota */ }
      try { window.dispatchEvent(new Event('ns-settings-synced')); } catch { /* ignore */ }
      void (async () => {
        try {
          const { syncUpNow } = await import('./serverSync');
          await syncUpNow();
        } catch { /* ignore */ }
      })();
    }
    return;
  }

  // Same inferred URL still active? No-op so we don't churn settings.
  if (list[0]?.sub === inferred && (list[0]?.id || '').startsWith('epg-auto-')) return;

  const entry: AutoEpgSource = {
    id:    `epg-auto-${Date.now()}`,
    kind:  'XML',
    title: 'Provider EPG (auto)',
    sub:   inferred,
    stat:  'auto-detected from playlist',
  };
  // Drop stale auto entries with a different URL, then prepend the
  // new one. We never touch entries the user added themselves.
  list = [entry, ...list.filter((s) => !(s.id || '').startsWith('epg-auto-'))];

  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* quota */ }
  try { window.dispatchEvent(new Event('ns-settings-synced')); } catch { /* ignore */ }
  void (async () => {
    try {
      const { syncUpNow } = await import('./serverSync');
      await syncUpNow();
    } catch { /* offline / unavailable */ }
  })();
}

// Returns the EPG URL the user's M3U declared on its #EXTM3U header,
// if any. Read from the in-memory cache so it's cheap; null when the
// playlist hasn't been parsed yet on this page, when no header
// attribute was present, or when the value isn't a usable http(s) URL.
export function getInferredEpgUrl(): string | null {
  const entry = MEM.get(memKey());
  return entry?.inferredEpgUrl ?? null;
}

// Loads channels for the currently-configured live source. Returns a
// rich result so callers can surface fetch / parse errors instead of
// swallowing them as "no channels".
export async function loadChannelsResult(): Promise<LoadResult> {
  const cached = getCachedChannels();
  if (cached && cached.length > 0) return { channels: cached };

  const src = getUserSourceUrl();
  if (!src) return { channels: [] };  // no source configured — not an error

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
