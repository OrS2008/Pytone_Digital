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
import './account.css';

interface NavItem {
  id:    string;
  href:  string;
  label: string;
  icon:  string;
}

const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Account',  items: [
    { id: 'overview',     href: '/tv/account',              label: 'Overview',     icon: '◉' },
    { id: 'subscription', href: '/tv/account/subscription', label: 'Subscription', icon: '◆' },
    { id: 'plans',        href: '/tv/account/plans',        label: 'Plans',        icon: '✦' },
    { id: 'devices',      href: '/tv/account/devices',      label: 'Devices',      icon: '▣' },
  ]},
  { group: 'Content', items: [
    { id: 'sources',      href: '/tv/account/sources',      label: 'Playlists & EPG', icon: '⛁' },
    { id: 'preferences',  href: '/tv/account/preferences',  label: 'Playback',     icon: '▶' },
    { id: 'parental',     href: '/tv/account/parental',     label: 'Parental',     icon: '◐' },
  ]},
  { group: 'System', items: [
    { id: 'appearance',   href: '/tv/account/appearance',   label: 'Appearance',   icon: '◑' },
    { id: 'help',         href: '/tv/account/help',         label: 'Help & legal', icon: '?' },
  ]},
];

function subscriptionBadge(status: string): string | null {
  if (status === 'subscribed') return 'PAID';
  if (status === 'trial')      return 'TRIAL';
  if (status === 'expired')    return 'ENDED';
  return null;
}

export default function Shell({ active, children }: { active: string; children: ReactNode }) {
  const access = useAccess();
  const badge  = subscriptionBadge(access.status);

  return (
    <main className="ac">
      <header className="ac-topbar">
        <Link href="/tv" className="ac-wm" style={{ textDecoration: 'none' }}>NOVA STREAM</Link>
        <nav className="ac-nav-links">
          <Link href="/tv" className="ac-link">Home</Link>
          <Link href="/tv/live" className="ac-link">Live</Link>
          <Link href="/tv/sports" className="ac-link">Sports</Link>
          <Link href="/tv/vod" className="ac-link">Movies</Link>
          <Link href="/tv/guide" className="ac-link">Guide</Link>
          <Link href="/tv/catchup" className="ac-link">Catch-up</Link>
          <Link href="/tv/account" className="ac-link ac-link-active">Account</Link>
        </nav>
        <AccountChip />
      </header>

      <div className="ac-body">
        <aside className="ac-sidebar">
          {NAV.map((sec) => (
            <div key={sec.group} className="ac-sb-section">
              <div className="ac-sb-heading">{sec.group}</div>
              {sec.items.map((it) => (
                <Link
                  key={it.id}
                  href={it.href}
                  className={`ac-sb-item ${active === it.id ? 'ac-sb-item-active' : ''}`}
                >
                  <span className="ac-sb-icon">{it.icon}</span>
                  <span>{it.label}</span>
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
