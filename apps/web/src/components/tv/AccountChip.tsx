'use client';

// Renders the right-hand side of the account top-bar: trial pill + avatar.
// Reads the signed-in email from lib/session so the initials and the
// dropdown reflect the actual user. Keeps a tiny hover menu with Sign
// out so the user can leave their tenant without hunting through the
// settings tree.

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { getSessionEmail, signOut } from '@/lib/session';

export default function AccountChip() {
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen]   = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setEmail(getSessionEmail()); }, []);

  // Close the menu on any click outside.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!email) {
    return (
      <div className="ac-account">
        <Link href="/tv/login" className="ac-btn ac-btn-sm">Sign in</Link>
      </div>
    );
  }

  const initials = email.split('@')[0].slice(0, 2).toUpperCase();
  return (
    <div className="ac-account" ref={ref} style={{ position: 'relative' }}>
      <span className="ac-trial-pill">Trial · 5 days left</span>
      <button
        className="ac-avatar"
        aria-label="Account menu"
        title={email}
        onClick={() => setOpen((v) => !v)}
        style={{ border: 0, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        {initials}
      </button>
      {open && (
        <div className="ac-menu">
          <div className="ac-menu-email">{email}</div>
          <Link href="/tv/account" className="ac-menu-item" onClick={() => setOpen(false)}>Account overview</Link>
          <Link href="/tv/account/subscription" className="ac-menu-item" onClick={() => setOpen(false)}>Subscription</Link>
          <Link href="/tv/account/security" className="ac-menu-item" onClick={() => setOpen(false)}>Security</Link>
          <button className="ac-menu-item ac-menu-danger" onClick={signOut}>Sign out</button>
        </div>
      )}
    </div>
  );
}
