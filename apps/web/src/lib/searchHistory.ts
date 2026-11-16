'use client';

// Recent searches, newest first, synced per account (SYNCED_KEYS).

import { userKey } from './session';

const KEY = 'search.history';
const MAX = 12;

export function getSearchHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const v = JSON.parse(localStorage.getItem(userKey(KEY)) || '[]');
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string' && s.trim()).slice(0, MAX) : [];
  } catch { return []; }
}

function write(list: string[]) {
  try { localStorage.setItem(userKey(KEY), JSON.stringify(list.slice(0, MAX))); } catch { /* ignore */ }
}

export function addSearch(q: string): string[] {
  const s = q.trim().slice(0, 80);
  if (s.length < 2) return getSearchHistory();
  const list = [s, ...getSearchHistory().filter((x) => x.toLowerCase() !== s.toLowerCase())];
  write(list);
  return list.slice(0, MAX);
}

export function removeSearch(q: string): string[] {
  const list = getSearchHistory().filter((x) => x !== q);
  write(list);
  return list;
}

export function clearSearchHistory() { write([]); }
