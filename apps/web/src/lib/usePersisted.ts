'use client';

import { useEffect, useState } from 'react';
import { userKey } from './session';

// Until the backend is reachable, settings the user changes survive a
// page reload via localStorage. Every entry is namespaced by the
// signed-in user (lib/session) so two accounts sharing the same browser
// do not see each other's data. SSR-safe: returns the default during
// server render and rehydrates on mount.
export default function usePersisted<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(userKey(key));
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch { /* ignore corrupt / locked storage */ }
    setLoaded(true);
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(userKey(key), JSON.stringify(value));
    } catch { /* storage full / private mode */ }
  }, [key, value, loaded]);

  return [value, setValue];
}
