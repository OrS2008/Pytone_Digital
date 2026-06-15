// Reusable shell for every /tv/account/* screen: top bar + left sidebar
// + content slot. Pages drop their content into <Shell active="...">.
//
// The badge next to "Subscription" reflects the user's real access
// state — TRIAL while the 7-day clock is running, PAID once a Stripe
// subscription has been verified, ENDED after the trial expires
// without a subscription. Pulled live from /api/auth/me via the
// useAccess hook so it stays accurate across renders.

'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import AccountChip from '@/components/tv/AccountChip';
import AccountGate from '@/components/auth/AccountGate';
import { useAccess } from '@/lib/useAccess';
import { useT } from '@/lib/i18n';
import './account.css';

// SVG icon set — replaces the unicode-glyph fallbacks (◉ ◆ ✦ ▣ ⛁ ▶
// ◐ ◑ ?) that rendered as broken-looking dingbats on mobile WebViews.
const Icons = {
  overview: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="6" rx="1.6"/>
      <rect x="3" y="13" width="11" height="7" rx="1.6"/>
      <rect x="17" y="13" width="4" height="7" rx="1.6"/>
    </svg>
  ),
  subscription: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="13" rx="2"/>
      <path d="M3 10h18M7 15h4"/>
    </svg>
  ),
  plans: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.5 14.5 8l6 .9-4.3 4.2 1 6L12 16.5 6.8 19.1l1-6L3.5 8.9 9.5 8z"/>
    </svg>
  ),
  devices: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="14" height="10" rx="1.6"/>
      <rect x="16" y="9" width="6" height="11" rx="1.4"/>
      <path d="M6 19h6"/>
    </svg>
  ),
  sources: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5.5" rx="8" ry="2.5"/>
      <path d="M4 5.5v6c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-6"/>
      <path d="M4 11.5v6c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-6"/>
    </svg>
  ),
  preferences: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <path d="M10 8.5v7l5-3.5z" fill="currentColor"/>
    </svg>
  ),
  parental: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6z"/>
      <path d="m9 12 2 2 4-4"/>
    </svg>
  ),
  appearance: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 12 3v0a4 4 0 0 0 0 8 4 4 0 0 1 0 8 9 9 0 0 0 9-6.2z"/>
    </svg>
  ),
  help: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.9.5-1 1-1 1.7M12 17h.01"/>
    </svg>
  ),
};

type NavItem = {
  id:     string;
  href:   string;
  labelKey: string;
  icon:   ReactNode;
};
type Section = { groupKey: string; items: NavItem[] };

const NAV: Section[] = [
  { groupKey: 'ac.group.account', items: [
    { id: 'overview',     href: '/tv/account',              labelKey: 'ac.nav.overview',     icon: Icons.overview },
    { id: 'subscription', href: '/tv/account/subscription', labelKey: 'ac.nav.subscription', icon: Icons.subscription },
    { id: 'plans',        href: '/tv/account/plans',        labelKey: 'ac.nav.plans',        icon: Icons.plans },
    { id: 'devices',      href: '/tv/account/devices',      labelKey: 'ac.nav.devices',      icon: Icons.devices },
  ]},
  { groupKey: 'ac.group.content', items: [
    { id: 'sources',      href: '/tv/account/sources',      labelKey: 'ac.nav.sources',      icon: Icons.sources },
    { id: 'preferences',  href: '/tv/account/preferences',  labelKey: 'ac.nav.preferences',  icon: Icons.preferences },
    { id: 'parental',     href: '/tv/account/parental',     labelKey: 'ac.nav.parental',     icon: Icons.parental },
  ]},
  { groupKey: 'ac.group.system',  items: [
    { id: 'appearance',   href: '/tv/account/appearance',   labelKey: 'ac.nav.appearance',   icon: Icons.appearance },
    { id: 'help',         href: '/tv/account/help',         labelKey: 'ac.nav.help',         icon: Icons.help },
  ]},
];

function subscriptionBadge(t: (k: string) => string, status: string): string | null {
  if (status === 'subscribed') return t('ac.badge.paid');
  if (status === 'trial')      return t('ac.badge.trial');
  if (status === 'expired')    return t('ac.badge.ended');
  return null;
}

export default function Shell({ active, children }: { active: string; children: ReactNode }) {
  const access = useAccess();
  const { t }  = useT();
  const badge  = subscriptionBadge(t, access.status);

  return (
    <main className="ac">
      <header className="ac-topbar">
        <Link href="/tv" className="ac-wm" style={{ textDecoration: 'none' }}>NOVA STREAM</Link>
        <nav className="ac-nav-links">
          <Link href="/tv"         className="ac-link">{t('nav.home')}</Link>
          <Link href="/tv/live"    className="ac-link">{t('nav.live')}</Link>
          <Link href="/tv/sports"  className="ac-link">{t('nav.sports')}</Link>
          <Link href="/tv/guide"   className="ac-link">{t('nav.guide')}</Link>
          <Link href="/tv/catchup" className="ac-link">{t('nav.catchup')}</Link>
          <Link href="/tv/account" className="ac-link ac-link-active">{t('nav.account')}</Link>
        </nav>
        <AccountChip />
      </header>

      <div className="ac-body">
        <aside className="ac-sidebar">
          {NAV.map((sec) => (
            <div key={sec.groupKey} className="ac-sb-section">
              <div className="ac-sb-heading">{t(sec.groupKey)}</div>
              {sec.items.map((it) => (
                <Link
                  key={it.id}
                  href={it.href}
                  className={`ac-sb-item ${active === it.id ? 'ac-sb-item-active' : ''}`}
                >
                  <span className="ac-sb-icon" aria-hidden>{it.icon}</span>
                  <span className="ac-sb-label">{t(it.labelKey)}</span>
                  {it.id === 'subscription' && badge
                    ? <span className="ac-sb-badge">{badge}</span>
                    : <span />}
                </Link>
              ))}
            </div>
          ))}
        </aside>

        <section className="ac-panel"><AccountGate>{children}</AccountGate></section>
      </div>
    </main>
  );
}
