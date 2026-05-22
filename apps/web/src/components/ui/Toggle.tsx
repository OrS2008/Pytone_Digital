'use client';

import { useState } from 'react';

// Controlled toggle. Used everywhere in /tv/account/*. The visual state
// uses the existing .ac-toggle / .ac-toggle-on classes from account.css.

export default function Toggle({ initialOn = false }: { initialOn?: boolean }) {
  const [on, setOn] = useState(initialOn);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setOn((v) => !v)}
      className={`ac-toggle ${on ? 'ac-toggle-on' : ''}`}
      style={{ border: 0, padding: 0, cursor: 'pointer' }}
    />
  );
}
