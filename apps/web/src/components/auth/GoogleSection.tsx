'use client';

// Wraps the GIS button + an "or" divider. Fetches /api/auth/google-config
// itself so the divider only renders when Google really is reachable —
// no empty space, no orphan "or" line.

import { useEffect, useState } from 'react';
import GoogleButton from './GoogleButton';

interface User { email: string; name?: string | null; picture?: string | null }
interface Props {
  onSuccess: (u: User) => void;
  onError?: (m: string) => void;
  dividerLabel?: string;
}

export default function GoogleSection({ onSuccess, onError, dividerLabel = 'or' }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/google-config', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { clientId: string | null }) => {
        if (!cancelled) setEnabled(!!d.clientId);
      })
      .catch(() => { if (!cancelled) setEnabled(false); });
    return () => { cancelled = true; };
  }, []);

  if (!enabled) return null;

  return (
    <>
      <div style={{ margin: '20px 0 8px' }}>
        <GoogleButton onSuccess={onSuccess} onError={onError} />
      </div>
      <div className="ac-auth-divider"><span>{dividerLabel}</span></div>
    </>
  );
}
