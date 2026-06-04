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
  'prefs.parental',         // parental-controls config
  'prefs.appearance',       // appearance / subtitle styling
  'prefs.notifications',    // notification toggles
  'prefs.streamMode',       // 'proxy' (default) or 'direct' — see streamProxy.ts
  'history',                // watch history
  'continueWatching',       // continue-watching shelf entries
  'recordings.scheduled',   // scheduled recordings
];

const DEBOUNCE_MS = 1_500;

let upTimer: ReturnType<typeof setTimeout> | null = null;
let upInFlight = false;
let upPending = false;

// Snapshot localStorage into a JSON blob the server can store.
function snapshot(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  const out: Record<string, unknown> = {};
  for (const key of SYNCED_KEYS) {
    try {
      const raw = localStorage.getItem(userKey(key));
      if (raw == null) continue;
      try { out[key] = JSON.parse(raw); }
      catch { out[key] = raw; }
    } catch { /* storage locked */ }
  }
  return out;
}

// Write a settings blob back into localStorage so the existing
// `usePersisted` hooks pick it up on next mount / reload. JSON values
// are re-stringified to match what usePersisted writes.
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
