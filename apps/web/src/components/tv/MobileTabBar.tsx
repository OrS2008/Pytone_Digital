'use client';

/*
 * MobileTabBar — the bottom 5-tab nav that the Android APK uses.
 *
 * Rendered by the /tv layout on every TV route. CSS hides it on tablets
 * and TVs (≥820px) so the desktop TvNav at the top stays in charge
 * there. On phones we hide TvNav and lean on this component instead,
 * which keeps the visual language of the new home page consistent
 * across login, live, search, guide, account etc.
 *
 * Localised via useT() so it follows the device language.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactElement } from 'react';
import { useT } from '@/lib/i18n';
import { getSessionEmail } from '@/lib/session';
import './MobileTabBar.css';

interface Tab {
  href: string;
  labelKey: string;
  match: (p: string) => boolean;
  icon: ReactElement;
}

const HOME_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11l9-8 9 8v10a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z"/>
  </svg>
);
const LIVE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="20" height="13" rx="2"/><path d="M8 21h8M12 19v2"/>
  </svg>
);
const SEARCH_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
  </svg>
);
const GUIDE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>
  </svg>
);
const ACCOUNT_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>
  </svg>
);

export default function MobileTabBar() {
  const pathname = usePathname() ?? '';
  const { t } = useT();
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => { setEmail(getSessionEmail()); }, []);

  // Routes where the tab bar should not show — full-bleed surfaces
  // where every pixel matters or chrome would be in the way.
  const HIDE_ON = ['/tv/login', '/tv/signup', '/tv/forgot-password',
                   '/tv/reset-password', '/tv/check-email',
                   '/tv/auth-action', '/tv/activate'];
  if (HIDE_ON.some((p) => pathname.startsWith(p))) return null;

  const accountHref = email ? '/tv/account' : '/tv/login';

  const tabs: Tab[] = [
    { href: '/tv/home',  labelKey: 'home.tab.home',    icon: HOME_ICON,
      match: (p) => p === '/tv' || p === '/tv/home' },
    { href: '/tv/live',  labelKey: 'home.tab.live',    icon: LIVE_ICON,
      match: (p) => p.startsWith('/tv/live') },
    { href: '/tv/search', labelKey: 'home.tab.search', icon: SEARCH_ICON,
      match: (p) => p.startsWith('/tv/search') },
    { href: '/tv/guide', labelKey: 'home.tab.guide',   icon: GUIDE_ICON,
      match: (p) => p.startsWith('/tv/guide') || p.startsWith('/tv/catchup') || p.startsWith('/tv/sports') },
    { href: accountHref, labelKey: 'home.tab.account', icon: ACCOUNT_ICON,
      match: (p) => p.startsWith('/tv/account') },
  ];

  return (
    <nav className="ns-mtab" aria-label="Primary navigation">
      {tabs.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link key={tab.href}
                href={tab.href}
                className={`ns-mtab-item ${active ? 'active' : ''}`}>
            {tab.icon}
            <span className="ns-mtab-label">{t(tab.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
