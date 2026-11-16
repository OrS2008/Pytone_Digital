'use client';

// Custom channel groups ("Kids", "News", "Dad's football"…): named lists
// of channel ids, synced per account (SYNCED_KEYS). Shown as filter chips
// on the live channel list; managed on /tv/account/groups.

import { userKey } from './session';

export interface ChannelGroup {
  id:       string;
  name:     string;
  channels: string[];   // channel ids (stable across re-parses; see favorites.ts)
}

const KEY = 'channels.groups';
const EVENT = 'ns-channel-groups';
export const MAX_GROUPS = 30;
export const MAX_PER_GROUP = 500;

export function getGroups(): ChannelGroup[] {
  if (typeof window === 'undefined') return [];
  try {
    const v = JSON.parse(localStorage.getItem(userKey(KEY)) || '[]');
    if (!Array.isArray(v)) return [];
    return v
      .filter((g) => g && typeof g.id === 'string' && typeof g.name === 'string' && Array.isArray(g.channels))
      .map((g) => ({ id: g.id, name: g.name, channels: g.channels.filter((c: unknown) => typeof c === 'string') }));
  } catch { return []; }
}

function write(list: ChannelGroup[]) {
  try {
    localStorage.setItem(userKey(KEY), JSON.stringify(list.slice(0, MAX_GROUPS)));
    window.dispatchEvent(new Event(EVENT));
  } catch { /* storage unavailable */ }
}

export function createGroup(name: string): ChannelGroup | null {
  const n = name.trim().slice(0, 40);
  const list = getGroups();
  if (!n || list.length >= MAX_GROUPS) return null;
  if (list.some((g) => g.name.toLowerCase() === n.toLowerCase())) return null;
  const g = { id: `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: n, channels: [] };
  write([...list, g]);
  return g;
}

export function renameGroup(id: string, name: string): boolean {
  const n = name.trim().slice(0, 40);
  const list = getGroups();
  if (!n || list.some((g) => g.id !== id && g.name.toLowerCase() === n.toLowerCase())) return false;
  write(list.map((g) => (g.id === id ? { ...g, name: n } : g)));
  return true;
}

export function deleteGroup(id: string) {
  write(getGroups().filter((g) => g.id !== id));
}

/** Adds or removes a channel; returns true when it is now in the group. */
export function toggleInGroup(id: string, channelId: string): boolean {
  let now = false;
  write(getGroups().map((g) => {
    if (g.id !== id) return g;
    if (g.channels.includes(channelId)) return { ...g, channels: g.channels.filter((c) => c !== channelId) };
    if (g.channels.length >= MAX_PER_GROUP) return g;
    now = true;
    return { ...g, channels: [...g.channels, channelId] };
  }));
  return now;
}

export function onGroupsChange(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener('ns-settings-synced', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('ns-settings-synced', cb);
  };
}
