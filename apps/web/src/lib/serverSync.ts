// Client-side bridge between localStorage and /api/settings.
//
// We deliberately kept the existing `usePersisted` hook and userKey()
// namespacing — every page that reads/writes settings still talks to
// localStorage, so the UI code didn't change. This module makes that
// localStorage trail mirror to the server:
//
//   - syncDown()  — after login, fetch the server blob and write each
//                   key into localStorage. Used to populate a fresh
//                   device with the user's existing settings.
//   - scheduleUp(key) — call after writing a key to localStorage. We
//                   coalesce repeated calls within DEBOUNCE_MS and ship
//                   the whole synced-keys snapshot as one PUT.
//
// SYNCED_KEYS is the allowlist of localStorage names (un-namespaced)
// that follow the user across devices. Anything outside the list stays
// local — e.g., temporary scroll positions, ephemeral cache markers.

'use client';

import { userKey } from './session';

// Keys (without the ns:<tenant>: prefix that userKey() adds) that ride
// the sync. Adding a new entry is the only step needed to make a new
// preference page sync — no API change.
export const SYNCED_KEYS: readonly string[] = [
  'sources.live',           // M3U source list
  'sources.epg',            // XMLTV source URL list
  'prefs.prefetchNeighbours', // neighbour-prefetch toggle
  'prefs.parental',         // parental-controls config (legacy)
  'prefs.appearance',       // appearance / subtitle styling
  'prefs.notifications',    // notification toggles
  'prefs.streamMode',       // 'proxy' (default) or 'direct' — see streamProxy.ts
  'prefs.spoilerProtection',// hide live scores in EPG / rail
  'prefs.ratingCap',        // parental rating cap (parental page)
  'parental.profiles',      // household profile list
  'parental.blocked',       // channel block list
  'history',                // watch history
  'continueWatching',       // continue-watching shelf entries
  'recordings',             // scheduled recordings (InfoBar + /tv/catchup write this key)
  'subs.preset',            // subtitle look-and-feel preset (SubtitleControls)
];

const DEBOUNCE_MS = 1_500;

let upTimer: ReturnType<typeof setTimeout> | null = null;
let upInFlight = false;
let upPending = false;

// Snapshot localStorage into a JSON blob the server can store.
//
// We send the RAW localStorage strings rather than parsing them first.
// The old implementation called JSON.parse() per key and stored the
// parsed value on the server — that round-trip silently broke any
// reader that expected to see what its writer produced:
//
//   * usePersisted writes JSON.stringify(value), so 'direct' → '"direct"'.
//     The old snapshot parsed that to 'direct' (no quotes) and stored a
//     plain string on the server. On download we wrote 'direct' back
//     into localStorage, and usePersisted's JSON.parse('direct') threw —
//     the setting silently reverted to its default.
//
//   * Toggle writes raw '1' / '0'. JSON.parse('1') = 1, stored as a
//     number; download stringified it back to '1'. That happened to
//     round-trip but only because Toggle compares the raw character.
//
// Storing the raw string keeps both writers and both readers honest:
// the server has bytes identical to localStorage, applyToLocalStorage
// puts those bytes back, and every consumer reads exactly what its
// own writer would have produced.
function snapshot(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const out: Record<string, string> = {};
  for (const key of SYNCED_KEYS) {
    try {
      const raw = localStorage.getItem(userKey(key));
      if (raw == null) continue;
      out[key] = raw;
    } catch { /* storage locked */ }
  }
  return out;
}

// Write a settings blob back into localStorage. Reads strings verbatim
// (new format); falls back to JSON.stringify for non-strings to soak
// up legacy server data written before the snapshot-direction fix
// above. Without this fallback, a user who had synced under the old
// code would download e.g. an array as `[object Object]`.
function applyToLocalStorage(blob: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  for (const [key, value] of Object.entries(blob)) {
    if (!SYNCED_KEYS.includes(key)) continue;
    try {
      const encoded = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(userKey(key), encoded);
    } catch { /* quota / locked */ }
  }
}

export async function syncDown(): Promise<{ ok: boolean; applied: number }> {
  if (typeof window === 'undefined') return { ok: false, applied: 0 };
  try {
    const r = await fetch('/api/settings', { credentials: 'include' });
    if (!r.ok) return { ok: false, applied: 0 };
    const body = await r.json() as { settings?: Record<string, unknown> };
    const blob = body.settings || {};
    applyToLocalStorage(blob);
    // Tell usePersisted hooks to re-read from localStorage. The
    // 'storage' event normally only fires cross-tab; we dispatch a
    // synthetic one so this tab's hooks also rehydrate.
    window.dispatchEvent(new Event('ns-settings-synced'));
    return { ok: true, applied: Object.keys(blob).length };
  } catch { return { ok: false, applied: 0 }; }
}

async function pushNow(): Promise<void> {
  if (typeof window === 'undefined') return;
  upInFlight = true;
  try {
    const body = JSON.stringify(snapshot());
    await fetch('/api/settings', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body,
    });
  } catch { /* ignore — next change retries */ }
  upInFlight = false;
  if (upPending) {
    upPending = false;
    scheduleUp();
  }
}

// Mark settings dirty; the actual PUT happens after DEBOUNCE_MS of
// idle. The (rare) call to this fn during an in-flight PUT queues a
// follow-up so the user never ends with a "lost write".
export function scheduleUp() {
  if (typeof window === 'undefined') return;
  if (upInFlight) { upPending = true; return; }
  if (upTimer) clearTimeout(upTimer);
  upTimer = setTimeout(() => { upTimer = null; pushNow(); }, DEBOUNCE_MS);
}

// True when a given un-namespaced key should be mirrored to the
// server. Used by usePersisted to avoid syncing non-listed keys.
export function isSyncedKey(key: string): boolean {
  return SYNCED_KEYS.includes(key);
}
