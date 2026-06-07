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

// Read a localStorage value tolerantly. usePersisted's own writes are
// JSON-stringified so the value is always parseable, but some other
// writers (Toggle, SubtitleControls, the server-sync legacy migration
// path) store raw strings like `direct` / `default` / `1` / `0`. If
// we strictly JSON.parse those we throw, fall back to the initial
// default, and the next write effect overwrites the legitimate raw
// value with the default — silently flipping the user's setting on
// every page load. So: JSON.parse first; on SyntaxError, accept the
// raw string as-is. Callers with primitive T (string / number /
// boolean / array / object) get a working value either way.
function lenientParse<T>(raw: string, initial: T): T {
  try { return JSON.parse(raw) as T; }
  catch { return raw as unknown as T; }
}

export default function usePersisted<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);

  // Read once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(userKey(key));
      if (raw != null) setValue(lenientParse(raw, initial));
    } catch { /* ignore corrupt / locked storage */ }
    setLoaded(true);
  }, [key, initial]);

  // Re-read when a server sync just overwrote localStorage.
  useEffect(() => {
    function onSynced() {
      try {
        const raw = localStorage.getItem(userKey(key));
        if (raw != null) setValue(lenientParse(raw, initial));
      } catch { /* ignore */ }
    }
    window.addEventListener('ns-settings-synced', onSynced);
    return () => window.removeEventListener('ns-settings-synced', onSynced);
  }, [key, initial]);

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
