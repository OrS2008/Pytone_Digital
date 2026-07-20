// Favorites ("My List") — a per-user set of channel ids kept in
// localStorage, namespaced by tenant like every other user-scoped key.
//
// Storage shape: JSON array of channel ids. Channel id (not number) is
// the stable key — numbers shift when the playlist reorders, ids come
// from tvg-id / URL hash and survive re-parses.
//
// A tiny subscriber list lets React components re-render when another
// component (the heart on a card, the InfoBar star) flips a favorite —
// no context provider needed for state this small.

import { userKey } from './session';

const KEY = 'favorites';

type Listener = () => void;
const listeners = new Set<Listener>();

function read(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(userKey(KEY));
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}

function write(set: Set<string>) {
  try { localStorage.setItem(userKey(KEY), JSON.stringify([...set])); } catch { /* quota */ }
  listeners.forEach((l) => { try { l(); } catch { /* listener error must not break the writer */ } });
}

export function getFavorites(): Set<string> {
  return read();
}

export function isFavorite(channelId: string): boolean {
  return read().has(channelId);
}

/** Flip a channel in/out of My List. Returns the NEW state (true = now a favorite). */
export function toggleFavorite(channelId: string): boolean {
  const set = read();
  const nowFav = !set.has(channelId);
  if (nowFav) set.add(channelId); else set.delete(channelId);
  write(set);
  return nowFav;
}

/** Re-run `fn` whenever favorites change (returns an unsubscribe). */
export function onFavoritesChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
