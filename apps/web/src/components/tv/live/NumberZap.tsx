'use client';

import { useEffect, useState } from 'react';

/*
 * Number-key channel zap (HOT/YES/FreeTV behaviour). Type "212" on the
 * remote and 800 ms after the last digit we commit to channel 212.
 *
 * Visual: a top-right overlay showing the digits as they're entered,
 * with a pink border, fading once the commit fires.
 */
export default function NumberZap({ onCommit }: { onCommit: (n: number) => void }) {
  const [buf, setBuf] = useState<string>('');

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;

    function onKey(e: KeyboardEvent) {
      // Only digit keys 0-9 (top row or numeric keypad).
      if (e.key.length !== 1 || e.key < '0' || e.key > '9') return;
      setBuf((b) => (b + e.key).slice(-4));
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        setBuf((b) => {
          if (b) onCommit(parseInt(b, 10));
          return '';
        });
      }, 800);
    }
    window.addEventListener('keydown', onKey);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [onCommit]);

  if (!buf) return null;
  return <div className="numzap">{buf}</div>;
}
