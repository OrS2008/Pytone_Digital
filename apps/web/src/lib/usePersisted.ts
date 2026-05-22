'use client';

import { useEffect, useState } from 'react';

// Until the backend is reachable, settings the user changes survive a
// page reload via localStorage. Same shape as useState. SSR-safe:
// returns the default during server render and rehydrates on mount.
export default function usePersisted<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);

  // Hydrate from localStorage on first client mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch { /* ignore corrupt / locked storage */ }
    setLoaded(true);
  }, [key]);

  // Write through on every change after hydration. We skip writes
  // before the read so we don't clobber a stored value with the
  // initial default on the first render.
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch { /* storage full / private mode */ }
  }, [key, value, loaded]);

  return [value, setValue];
}
