// Reusable shell for every /tv/account/* screen: top bar + left sidebar
// + content slot. Pages drop their content into <Shell active="...">.

import Link from 'next/link';
import type { ReactNode } from 'react';
import AccountChip from '@/components/tv/AccountChip';
import './account.css';

const NAV = [
  { group: 'Account',  items: [
    { id: 'overview',     href: '/tv/account',              label: 'Overview',     icon: '◉' },
    { id: 'subscription', href: '/tv/account/subscription', label: 'Subscription', icon: '◆', badge: 'TRIAL' },
    { id: 'plans',        href: '/tv/account/plans',        label: 'Plans',        icon: '✦' },
    { id: 'devices',      href: '/tv/account/devices',      label: 'Devices',      icon: '▣' },
    { id: 'security',     href: '/tv/account/security',     label: 'Security',     icon: '⚿' },
  ]},
  { group: 'Content', items: [
    { id: 'sources',      href: '/tv/account/sources',      label: 'Playlists & EPG', icon: '⛁' },
    { id: 'preferences',  href: '/tv/account/preferences',  label: 'Playback',     icon: '▶' },
    { id: 'parental',     href: '/tv/account/parental',     label: 'Parental',     icon: '◐' },
  ]},
  { group: 'System', items: [
    { id: 'appearance',   href: '/tv/account/appearance',   label: 'Appearance',   icon: '◑' },
    { id: 'notifications',href: '/tv/account/notifications',label: 'Notifications',icon: '◫' },
    { id: 'help',         href: '/tv/account/help',         label: 'Help & legal', icon: '?' },
  ]},
] as const;

export default function Shell({ active, children }: { active: string; children: ReactNode }) {
  return (
    <main className="ac">
      <header className="ac-topbar">
        <Link href="/tv/live" className="ac-wm" style={{ textDecoration: 'none' }}>NOVA STREAM</Link>
        <nav className="ac-nav-links">
          <Link href="/tv/live" className="ac-link">Live</Link>
          <Link href="/tv/vod" className="ac-link">Movies</Link>
          <Link href="/tv/sports" className="ac-link">Sports</Link>
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
                  {'badge' in it && it.badge ? <span className="ac-sb-badge">{it.badge}</span> : <span />}
                </Link>
              ))}
            </div>
          ))}
        </aside>

        <section className="ac-panel">{children}</section>
      </div>
    </main>
  );
}
