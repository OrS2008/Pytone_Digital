'use client';

// Parental block list + PIN lock, enforced where channels are loaded.
//
//   parental.blocked  synced list of names; a channel whose name contains
//                     an entry (case-insensitive), or whose category equals
//                     one, is removed from every channel list the app shows
//                     (live, home, search, guide, catch-up, deep links).
//   parental.pinHash  per-device SHA-256 of a 4-digit PIN. When set, the
//                     block list can only be edited, and blocked channels
//                     only shown, after unlocking with the PIN.
//   parental.unlockedUntil  per-device unlock expiry (1 hour).
//
// This is a household convenience lock running in the browser, not a
// security boundary: someone with access to the device's storage can
// clear it. The Parental screen says so.

import { userKey } from './session';

const BLOCKED_KEY = 'parental.blocked';
const PIN_KEY = 'parental.pinHash';
const UNLOCK_KEY = 'parental.unlockedUntil';
export const UNLOCK_MS = 60 * 60 * 1000;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(userKey(key));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

export function getBlocked(): string[] {
  const v = readJson<unknown>(BLOCKED_KEY, []);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];
}

export function setBlocked(list: string[]): void {
  try {
    localStorage.setItem(userKey(BLOCKED_KEY), JSON.stringify(list));
    window.dispatchEvent(new Event('ns-parental-changed'));
  } catch { /* storage unavailable */ }
}

export function hasPin(): boolean {
  if (typeof window === 'undefined') return false;
  try { return !!localStorage.getItem(userKey(PIN_KEY)); } catch { return false; }
}

export function isUnlocked(): boolean {
  if (!hasPin()) return true;
  const until = readJson<number>(UNLOCK_KEY, 0);
  return typeof until === 'number' && until > Date.now();
}

export async function sha256Hex(input: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function unlock(pin: string): Promise<boolean> {
  try {
    const stored = localStorage.getItem(userKey(PIN_KEY));
    if (!stored || stored !== (await sha256Hex(pin))) return false;
    localStorage.setItem(userKey(UNLOCK_KEY), JSON.stringify(Date.now() + UNLOCK_MS));
    window.dispatchEvent(new Event('ns-parental-changed'));
    return true;
  } catch { return false; }
}

export function lock(): void {
  try {
    localStorage.removeItem(userKey(UNLOCK_KEY));
    window.dispatchEvent(new Event('ns-parental-changed'));
  } catch { /* ignore */ }
}

export async function setPin(pin: string): Promise<void> {
  localStorage.setItem(userKey(PIN_KEY), await sha256Hex(pin));
  localStorage.removeItem(userKey(UNLOCK_KEY));
  window.dispatchEvent(new Event('ns-parental-changed'));
}

export function clearPin(): void {
  localStorage.removeItem(userKey(PIN_KEY));
  localStorage.removeItem(userKey(UNLOCK_KEY));
  window.dispatchEvent(new Event('ns-parental-changed'));
}

/** Does `entry` block a channel with this name / category? */
export function blocks(entry: string, name: string, category: string): boolean {
  const e = entry.trim().toLowerCase();
  if (e.length < 2) return false;
  return name.toLowerCase().includes(e) || category.trim().toLowerCase() === e;
}

/** Remove blocked channels, unless the PIN lock is currently unlocked. */
export function applyParental<T extends { name: string; category: string }>(channels: T[]): T[] {
  const list = getBlocked();
  if (list.length === 0) return channels;
  if (hasPin() && isUnlocked()) return channels;
  return channels.filter((c) => !list.some((e) => blocks(e, c.name, c.category || '')));
}
