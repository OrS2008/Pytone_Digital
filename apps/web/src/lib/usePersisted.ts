'use client';

import { useEffect, useState } from 'react';
import { userKey } from './session';
import { isSyncedKey, scheduleUp } from './serverSync';

// Settings persistence with two backends layered together:
//   1. localStorage on the device — fast path, survives reload.
//   2. /api/settings on Cloudflare KV — slow path, survives device
//      change. Only keys listed in SYNCED_KEYS (lib/serverSync) ride
//      the server side; everything else stays local.
//
// SSR-safe: the server render returns the `initial` default; the
// client effect rehydrates from localStorage on mount and pushes a
// (debounced) server update on every change.
//
// The hook also listens for an `ns-settings-synced` event so that when
// the syncDown() call after login overwrites localStorage, every
// mounted instance picks up the new value without a page reload.
export default function usePersisted<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);

  // Read once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(userKey(key));
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch { /* ignore corrupt / locked storage */ }
    setLoaded(true);
  }, [key]);

  // Re-read when a server sync just overwrote localStorage.
  useEffect(() => {
    function onSynced() {
      try {
        const raw = localStorage.getItem(userKey(key));
        if (raw != null) setValue(JSON.parse(raw) as T);
      } catch { /* ignore */ }
    }
    window.addEventListener('ns-settings-synced', onSynced);
    return () => window.removeEventListener('ns-settings-synced', onSynced);
  }, [key]);

  // Write on change. We don't want this to fire on the initial mount
  // when `loaded` flips false → true, since that would push the
  // default back over the server's real value.
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(userKey(key), JSON.stringify(value)); }
    catch { /* storage full / private mode */ }
    if (isSyncedKey(key)) scheduleUp();
  }, [key, value, loaded]);

  return [value, setValue];
}
