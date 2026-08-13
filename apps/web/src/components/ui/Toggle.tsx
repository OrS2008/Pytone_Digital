'use client';

import { useEffect, useState } from 'react';
import { userKey } from '@/lib/session';
import { isSyncedKey, scheduleUp } from '@/lib/serverSync';

// Controlled toggle. Used everywhere in /tv/account/*. The visual state
// uses the existing .ac-toggle / .ac-toggle-on classes from account.css.
//
// Pass `persistKey` to bind the value to localStorage namespaced by the
// signed-in tenant, so the preference persists across navigation and
// can be read elsewhere in the app via the matching userKey lookup.

interface Props {
  initialOn?: boolean;
  persistKey?: string;
  onChange?: (on: boolean) => void;
}

export default function Toggle({ initialOn = false, persistKey, onChange }: Props) {
  const [on, setOn] = useState(initialOn);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!persistKey) { setHydrated(true); return; }
    const read = () => {
      try {
        const raw = localStorage.getItem(userKey(persistKey));
        if (raw === '1') setOn(true);
        else if (raw === '0') setOn(false);
      } catch { /* ignore */ }
    };
    read();
    setHydrated(true);
    // syncDown() rewrites localStorage in place and announces it.
    // usePersisted re-reads on this event; without the same listener a
    // toggle kept rendering the pre-sync value until it remounted.
    window.addEventListener('ns-settings-synced', read);
    return () => window.removeEventListener('ns-settings-synced', read);
  }, [persistKey]);

  useEffect(() => {
    if (!hydrated || !persistKey) return;
    try { localStorage.setItem(userKey(persistKey), on ? '1' : '0'); } catch { /* ignore */ }
    // usePersisted schedules an upload after every write; Toggle did
    // not, so a synced toggle (prefs.prefetchNeighbours,
    // prefs.spoilerProtection) only ever reached the server if some
    // other synced key happened to push afterwards and carried it
    // along in the snapshot.
    if (isSyncedKey(persistKey)) scheduleUp();
  }, [on, hydrated, persistKey]);

  function flip() {
    const next = !on;
    setOn(next);
    onChange?.(next);
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={flip}
      className={`ac-toggle ${on ? 'ac-toggle-on' : ''}`}
      style={{ border: 0, padding: 0, cursor: 'pointer' }}
    />
  );
}
