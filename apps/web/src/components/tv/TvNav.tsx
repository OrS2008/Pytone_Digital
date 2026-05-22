'use client';

import { useEffect, useState } from 'react';
import { useCurrentZone, useSetZone } from './TvFocus';

const ITEMS = [
  { label: 'Live',    href: '/tv/live' },
  { label: 'Home',    href: '/tv' },
  { label: 'Sports',  href: '/tv/sports' },
  { label: 'Movies',  href: '/tv/vod' },
  { label: 'Search',  href: '/tv/search' },
];

const ZONE = 'nav';

export default function TvNav() {
  const focusNav = useSetZone(ZONE);
  const current  = useCurrentZone();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (current !== ZONE) return;
      if (e.key === 'ArrowLeft'  && idx > 0)                  setIdx(idx - 1);
      if (e.key === 'ArrowRight' && idx < ITEMS.length)       setIdx(idx + 1);
      if (e.key === 'Enter') {
        if (idx < ITEMS.length) window.location.href = ITEMS[idx].href;
        else                    window.location.href = '/tv/account';
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, current]);

  return (
    <nav className="tv-nav" data-tv-focus="1" onMouseEnter={focusNav}>
      <span className="tv-nav-wordmark">NOVA STREAM</span>
      {ITEMS.map((it, i) => (
        <a
          key={it.href}
          href={it.href}
          className={`tv-nav-link ${current === ZONE && i === idx ? 'focused' : ''}`}
          onMouseEnter={() => { focusNav(); setIdx(i); }}
        >
          {it.label}
        </a>
      ))}
      <a
        href="/tv/account"
        className={`tv-nav-avatar ${current === ZONE && idx === ITEMS.length ? 'focused' : ''}`}
        onMouseEnter={() => { focusNav(); setIdx(ITEMS.length); }}
        title="Account"
        aria-label="Account"
      >
        OS
      </a>
    </nav>
  );
}
