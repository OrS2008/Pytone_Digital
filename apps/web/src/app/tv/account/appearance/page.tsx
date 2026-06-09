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

      <div className="ac-card" style={{ marginTop: 22 }}>
        <div className="ac-card-title">Accessibility</div>
        <AccessibilityControls />
      </div>
    </Shell>
  );
}

// Three accessibility toggles wired straight into <html> data
// attributes so themes.css / globals.css can react with attribute
// selectors. Persisted globally (not per-user) because the access
// preferences belong to whoever is sitting in front of the device.
function AccessibilityControls() {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [biggerText,   setBiggerText]   = useState(false);
  const [followSystem, setFollowSystem] = useState(false);

  useEffect(() => {
    try {
      setReduceMotion(localStorage.getItem('ns.a11y.reduceMotion') === '1');
      setBiggerText(localStorage.getItem('ns.a11y.biggerText')     === '1');
      setFollowSystem(localStorage.getItem('ns.a11y.followSystem') === '1');
    } catch { /* ignore */ }
  }, []);

  function flip(
    key: 'reduceMotion' | 'biggerText' | 'followSystem',
    value: boolean,
    setter: (v: boolean) => void,
  ) {
    setter(value);
    try { localStorage.setItem(`ns.a11y.${key}`, value ? '1' : '0'); } catch { /* ignore */ }
    // Mirror to <html> so CSS attribute selectors pick it up
    // immediately without a reload.
    const map = {
      reduceMotion: 'data-reduce-motion',
      biggerText:   'data-bigger-text',
      followSystem: 'data-follow-system',
    } as const;
    document.documentElement.setAttribute(map[key], value ? '1' : '0');
    // System-theme follow: pick light vs. dark off the media query
    // and re-apply the matching theme.
    if (key === 'followSystem' && value) {
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const themeForMode = dark ? 'apex' : 'mono';
      document.documentElement.setAttribute('data-theme', themeForMode);
      document.body.setAttribute('data-theme', themeForMode);
      try { localStorage.setItem('ns.theme', themeForMode); } catch { /* ignore */ }
    }
  }

  return (
    <>
      <div className="ac-toggle-row">
        <div>
          <div className="ac-toggle-title">Follow system dark / light</div>
          <div className="ac-toggle-desc">
            Switch theme automatically to match the OS preference. Overrides
            the picker above while turned on.
          </div>
        </div>
        <label className="ac-toggle-switch">
          <input type="checkbox" checked={followSystem} onChange={(e) => flip('followSystem', e.target.checked, setFollowSystem)} />
          <span className="ac-toggle-track"><span className="ac-toggle-knob" /></span>
        </label>
      </div>
      <div className="ac-toggle-row">
        <div>
          <div className="ac-toggle-title">Reduce motion</div>
          <div className="ac-toggle-desc">
            Disables fade and scale animations across the app. Helps with
            motion-sensitivity and saves a sliver of GPU on low-power TVs.
          </div>
        </div>
        <label className="ac-toggle-switch">
          <input type="checkbox" checked={reduceMotion} onChange={(e) => flip('reduceMotion', e.target.checked, setReduceMotion)} />
          <span className="ac-toggle-track"><span className="ac-toggle-knob" /></span>
        </label>
      </div>
      <div className="ac-toggle-row">
        <div>
          <div className="ac-toggle-title">Bigger text</div>
          <div className="ac-toggle-desc">
            Bumps body text size by 15 %. Useful when watching from the
            couch on a wall-mounted TV.
          </div>
        </div>
        <label className="ac-toggle-switch">
          <input type="checkbox" checked={biggerText} onChange={(e) => flip('biggerText', e.target.checked, setBiggerText)} />
          <span className="ac-toggle-track"><span className="ac-toggle-knob" /></span>
        </label>
      </div>
    </>
  );
}
