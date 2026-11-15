'use client';

// Per-tenant watch history.
//
// localStorage shape (keyed by userKey('history')):
//   { [channelId]: { channelId, number, name, logoUrl?, lastWatched, lastDurationMs } }
//
// The live page calls `recordWatch(channel, ms)` whenever the user
// settles on a channel for more than a few seconds. The home page
// renders the most-recent N entries as a "Continue Watching" row that
// deep-links back into /tv/live with the channel pre-selected (via
// the ?ch=<number> query string that the live page already reads).
//
// Tiny by design — no IndexedDB, no idle-timer logic, no syncing.
// Persists across sessions, isolated per user via userKey.

import { userKey } from './session';

export interface WatchEntry {
  channelId:      string;
  number:         number;
  name:           string;
  logoUrl?:       string;
  lastWatched:    number; // epoch ms
  lastDurationMs: number; // dwell time on the channel (rough)
}

const MAX = 20;

function read(): Record<string, WatchEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(userKey('history'));
    return raw ? (JSON.parse(raw) as Record<string, WatchEntry>) : {};
  } catch { return {}; }
}

function write(map: Record<string, WatchEntry>) {
  // Cap the dictionary so it doesn't grow unbounded — keep the most
  // recent MAX entries.
  const entries = Object.values(map)
    .sort((a, b) => b.lastWatched - a.lastWatched)
    .slice(0, MAX);
  const next: Record<string, WatchEntry> = {};
  for (const e of entries) next[e.channelId] = e;
  try { localStorage.setItem(userKey('history'), JSON.stringify(next)); } catch { /* ignore */ }
}

export function recordWatch(ch: { id: string; number: number; name: string; logoUrl?: string }, durationMs = 0) {
  if (typeof window === 'undefined') return;
  const map = read();
  const prev = map[ch.id];
  map[ch.id] = {
    channelId:      ch.id,
    number:         ch.number,
    name:           ch.name,
    logoUrl:        ch.logoUrl,
    lastWatched:    Date.now(),
    lastDurationMs: (prev?.lastDurationMs ?? 0) + durationMs,
  };
  write(map);
}

// History narrowed to the playlist that is loaded right now. Entries
// are keyed by channel id + number, both of which are only meaningful
// inside the playlist they were recorded from — after a playlist
// change an old entry would otherwise sit in Continue Watching and
// open whatever unrelated channel now has that number.
export function getHistoryFor(channels: { id: string; number: number; name: string }[]): WatchEntry[] {
  if (channels.length === 0) return [];
  const byId = new Map(channels.map((c) => [c.id, c]));
  const out: WatchEntry[] = [];
  for (const e of getHistory()) {
    const c = byId.get(e.channelId);
    if (c && c.name === e.name) out.push({ ...e, number: c.number });
  }
  return out;
}

export function getHistory(): WatchEntry[] {
  return Object.values(read()).sort((a, b) => b.lastWatched - a.lastWatched);
}
