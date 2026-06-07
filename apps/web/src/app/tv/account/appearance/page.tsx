// Appearance — theme picker + interface language.
//
// Switching writes the choice to localStorage and sets the data-theme
// attribute on <html> + <body>, which triggers all CSS variables in
// themes.css to swap. Every screen in the app updates in real time
// without a reload.
//
// Cleanup pass:
//   * Four "Display options" toggles (Match system dark/light, High
//     contrast, Reduce motion, Bigger text) had no persistKey and no
//     reader anywhere in the codebase — they were UI ornaments. Gone.
//   * Sub-copy claimed the theme "syncs to your other devices
//     automatically". The theme key is intentionally GLOBAL (not
//     userKey-scoped) because TvBoot reads it during first paint,
//     before the session is known — so it can't ride the
//     SYNCED_KEYS rail without re-flashing on every load. Copy now
//     reflects reality: theme is per-device, language follows you.
'use client';

import { useEffect, useState } from 'react';
import Shell from '../Shell';
import { LOCALES, useT } from '@/lib/i18n';

type ThemeId = 'apex' | 'aurora' | 'mono' | 'cyber' | 'premium';

const THEMES: { id: ThemeId; name: string; tag: string; preview: string }[] = [
  { id: 'apex',    name: 'Apex Dark',        tag: 'Default · Apple TV / Disney+ feel',          preview: 'ac-tp-apex' },
  { id: 'aurora',  name: 'Aurora Glass',     tag: 'Frosted glass · VisionOS / iOS 18',          preview: 'ac-tp-aurora' },
  { id: 'mono',    name: 'Editorial Mono',   tag: 'Black & white + acid lime · magazine cover', preview: 'ac-tp-mono' },
  { id: 'cyber',   name: 'Cyber HUD',        tag: 'Cyan neon · sci-fi command centre',          preview: 'ac-tp-cyber' },
  { id: 'premium', name: 'Premium Charcoal', tag: 'Warm charcoal + brushed gold',               preview: 'ac-tp-premium' },
];

export default function Appearance() {
  const [active, setActive] = useState<ThemeId>('apex');
  const { locale, setLocale, t } = useT();

  useEffect(() => {
    const saved = (typeof window !== 'undefined' && localStorage.getItem('ns.theme')) as ThemeId | null;
    if (saved) setActive(saved);
  }, []);

  function pick(id: ThemeId) {
    setActive(id);
    document.documentElement.setAttribute('data-theme', id);
    document.body.setAttribute('data-theme', id);
    localStorage.setItem('ns.theme', id);
  }

  return (
    <Shell active="appearance">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Appearance</div>
        <h1 className="ac-panel-title">Pick a theme</h1>
        <p className="ac-panel-sub">
          The theme is a per-device preference — pick the one that fits the
          screen you&apos;re looking at. Your interface language, on the
          other hand, follows your account.
        </p>
      </header>

      <div className="ac-themes">
        {THEMES.map((tile) => (
          <button
            key={tile.id}
            className={`ac-theme ${active === tile.id ? 'ac-theme-selected' : ''}`}
            onClick={() => pick(tile.id)}
            style={{ background: 'transparent', padding: 0, font: 'inherit', color: 'inherit' }}
          >
            <div className={`ac-theme-preview ${tile.preview}`} />
            <div className="ac-theme-meta">
              <div className="ac-theme-name">{tile.name}</div>
              <div className="ac-theme-tag">{tile.tag}</div>
            </div>
            {active === tile.id && <div className="ac-theme-check">✓</div>}
          </button>
        ))}
      </div>

      <div className="ac-card" style={{ marginTop: 28 }}>
        <div className="ac-card-title">{t('pref.language')}</div>
        <div className="ac-toggle-row">
          <div style={{ minWidth: 240 }}>
            <div className="ac-toggle-title">{t('pref.language')}</div>
            <div className="ac-toggle-desc">
              Interface language. Hebrew automatically switches the app to
              right-to-left.
            </div>
          </div>
          <select
            className="ac-input"
            style={{ width: 220 }}
            value={locale}
            onChange={(e) => setLocale(e.target.value as 'en' | 'he')}
          >
            {LOCALES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">On the roadmap</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 13.5, margin: '0 0 8px' }}>
          Accessibility controls planned for this screen:
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: 'var(--ns-text-muted)', lineHeight: 1.8 }}>
          <li>Follow the system dark/light preference</li>
          <li>High-contrast variants of each theme</li>
          <li>Reduce-motion (disable fade and scale animations)</li>
          <li>Bigger text (+15 % body text size for far seating)</li>
        </ul>
      </div>
    </Shell>
  );
}
