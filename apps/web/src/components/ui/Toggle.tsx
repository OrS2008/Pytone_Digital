'use client';

import { useEffect, useState } from 'react';
import { userKey } from '@/lib/session';

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
    try {
      const raw = localStorage.getItem(userKey(persistKey));
      if (raw === '1') setOn(true);
      else if (raw === '0') setOn(false);
    } catch { /* ignore */ }
    setHydrated(true);
  }, [persistKey]);

  useEffect(() => {
    if (!hydrated || !persistKey) return;
    try { localStorage.setItem(userKey(persistKey), on ? '1' : '0'); } catch { /* ignore */ }
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
