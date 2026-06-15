'use client';

// Right-hand side of the account top-bar: trial / subscription pill +
// avatar with a hover menu. The pill text is driven by /api/auth/me via
// the shared useAccess() hook so it reflects the real days remaining
// rather than the placeholder "Trial · 5 days left" that used to be
// hardcoded.

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { getSessionEmail, signOut } from '@/lib/session';
import { useAccess } from '@/lib/useAccess';
import { useT } from '@/lib/i18n';

export default function AccountChip() {
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen]   = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const access = useAccess();
  const { t }  = useT();

  useEffect(() => { setEmail(getSessionEmail()); }, []);

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
        <Link href="/tv/login" className="ac-btn ac-btn-sm">{t('auth.signIn')}</Link>
      </div>
    );
  }

  const initials = email.split('@')[0].slice(0, 2).toUpperCase();

  // Pill text. Hidden entirely for paid / loading / error so we never
  // show stale or fictional text — the worst-case is a slightly emptier
  // top bar, which is fine.
  let pill: { text: string; tone: 'trial' | 'warn' } | null = null;
  if (access.status === 'trial') {
    const d = access.daysLeft ?? 0;
    const label =
      d <= 0 ? t('chip.trialEndsToday') :
      d === 1 ? t('chip.trial1Day') :
                t('chip.trialNDays').replace('{n}', String(d));
    pill = { text: label, tone: 'trial' };
  } else if (access.status === 'expired') {
    pill = { text: t('chip.trialExpired'), tone: 'warn' };
  }

  return (
    <div className="ac-account" ref={ref} style={{ position: 'relative' }}>
      {pill && (
        <span className={`ac-trial-pill ${pill.tone === 'warn' ? 'ac-trial-pill-warn' : ''}`}>
          {pill.text}
        </span>
      )}
      <button
        className="ac-avatar"
        aria-label={t('chip.menu')}
        title={email}
        onClick={() => setOpen((v) => !v)}
        style={{ border: 0, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        {initials}
      </button>
      {open && (
        <div className="ac-menu">
          <div className="ac-menu-email">{email}</div>
          <Link href="/tv/account" className="ac-menu-item" onClick={() => setOpen(false)}>{t('ac.nav.overview')}</Link>
          <Link href="/tv/account/subscription" className="ac-menu-item" onClick={() => setOpen(false)}>{t('ac.nav.subscription')}</Link>
          <Link href="/tv/account/security" className="ac-menu-item" onClick={() => setOpen(false)}>{t('chip.security')}</Link>
          <button className="ac-menu-item ac-menu-danger" onClick={signOut}>{t('auth.signOut')}</button>
        </div>
      )}
    </div>
  );
}
