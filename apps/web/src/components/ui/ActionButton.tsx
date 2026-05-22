'use client';

import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

// Generic "do something" button used across the account screens.
// On click it flashes a "Done ✓" label for 1.4s. The real backend
// integration lands later; until then the visual feedback is enough
// for the user to verify the UI is alive.

interface Props {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  doneLabel?: string;
  onAction?: () => void;
}

export default function ActionButton({
  className = 'ac-btn ac-btn-sm',
  style,
  children,
  doneLabel = 'Done ✓',
  onAction,
}: Props) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={() => {
        onAction?.();
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      {done ? doneLabel : children}
    </button>
  );
}
