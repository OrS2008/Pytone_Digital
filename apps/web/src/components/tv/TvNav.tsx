'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCurrentZone, useSetZone } from './TvFocus';
import { getSessionEmail } from '@/lib/session';
import { useT } from '@/lib/i18n';

const ITEMS: { key: string; href: string }[] = [
  { key: 'nav.live',     href: '/tv/live' },
  { key: 'nav.home',     href: '/tv' },
  { key: 'nav.sports',   href: '/tv/sports' },
  { key: 'nav.movies',   href: '/tv/vod' },
  { key: 'nav.catchup',  href: '/tv/catchup' },
  { key: 'nav.search',   href: '/tv/search' },
];

const ZONE = 'nav';

export default function TvNav() {
  const focusNav = useSetZone(ZONE);
  const current  = useCurrentZone();
  const pathname = usePathname();
  const { t } = useT();
  const [idx, setIdx] = useState(0);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => { setEmail(getSessionEmail()); }, []);

  // Highlight the nav link that matches the current route so the user
  // always sees which section they're on (not just the keyboard-focused
  // link). Exact match for /tv → Home; prefix match for /tv/live etc.
  const activeIdx = ITEMS.findIndex((it) => {
    if (it.href === '/tv') return pathname === '/tv';
    return pathname?.startsWith(it.href);
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (current !== ZONE) return;
      if (e.key === 'ArrowLeft'  && idx > 0)             setIdx(idx - 1);
      if (e.key === 'ArrowRight' && idx < ITEMS.length)  setIdx(idx + 1);
      if (e.key === 'Enter') {
        if (idx < ITEMS.length) window.location.href = ITEMS[idx].href;
        else                    window.location.href = email ? '/tv/account' : '/tv/login';
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, current, email]);

  const initials = email ? email.split('@')[0].slice(0, 2).toUpperCase() : '↳';

  return (
    <nav className="tv-nav" data-tv-focus="1" onMouseEnter={focusNav}>
      <span className="tv-nav-wordmark">NOVA STREAM</span>
      {ITEMS.map((it, i) => (
        <a
          key={it.href}
          href={it.href}
          className={`tv-nav-link ${current === ZONE && i === idx ? 'focused' : ''} ${i === activeIdx ? 'active' : ''}`}
          onMouseEnter={() => { focusNav(); setIdx(i); }}
        >
          {t(it.key)}
        </a>
      ))}
      <Link
        href={email ? '/tv/account' : '/tv/login'}
        className={`tv-nav-avatar ${current === ZONE && idx === ITEMS.length ? 'focused' : ''}`}
        onMouseEnter={() => { focusNav(); setIdx(ITEMS.length); }}
        title={email ?? 'Sign in'}
        aria-label={email ? `Account · ${email}` : 'Sign in'}
      >
        {initials}
      </Link>
    </nav>
  );
}
