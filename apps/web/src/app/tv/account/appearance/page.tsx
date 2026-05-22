// Appearance — the theme picker. Switching writes the choice to
// localStorage and sets the data-theme attribute on <html> + <body>, which
// triggers all CSS variables in themes.css to swap. Every screen in the
// app updates in real time without a reload.
'use client';

import { useEffect, useState } from 'react';
import Shell from '../Shell';
import Toggle from '@/components/ui/Toggle';

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
          Your choice applies across the whole app — Live TV, Movies, DVR and Account —
          and syncs to your other devices automatically. Tap any tile to apply.
        </p>
      </header>

      <div className="ac-themes">
        {THEMES.map((t) => (
          <button
            key={t.id}
            className={`ac-theme ${active === t.id ? 'ac-theme-selected' : ''}`}
            onClick={() => pick(t.id)}
            style={{ background: 'transparent', padding: 0, font: 'inherit', color: 'inherit' }}
          >
            <div className={`ac-theme-preview ${t.preview}`} />
            <div className="ac-theme-meta">
              <div className="ac-theme-name">{t.name}</div>
              <div className="ac-theme-tag">{t.tag}</div>
            </div>
            {active === t.id && <div className="ac-theme-check">✓</div>}
          </button>
        ))}
      </div>

      <div className="ac-card" style={{ marginTop: 28 }}>
        <div className="ac-card-title">Display options</div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Match system dark / light</div>
            <div className="ac-toggle-desc">Follow your device's appearance setting. Light variants of each theme are coming.</div>
          </div>
          <Toggle />
        </div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">High contrast</div>
            <div className="ac-toggle-desc">Boosts text against backgrounds for low-light viewing.</div>
          </div>
          <Toggle />
        </div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Reduce motion</div>
            <div className="ac-toggle-desc">Disables fade and scale animations. Saves on older TVs.</div>
          </div>
          <Toggle />
        </div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Bigger text</div>
            <div className="ac-toggle-desc">Increases body text by 15% — better for far seating.</div>
          </div>
          <Toggle />
        </div>
      </div>
    </Shell>
  );
}
