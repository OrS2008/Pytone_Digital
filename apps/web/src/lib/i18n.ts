// Minimal in-house i18n.
//
// Why not next-intl / i18next:
//   The product is launching with two language pairs (en/he) and a
//   handful of strings — pulling in a translation library is more bytes
//   on the client than the dictionary itself. We can swap to next-intl
//   later by re-exporting `t()` from its API.
//
// The locale is stored in localStorage so the choice survives reloads
// without a backend, and a pre-paint script in app/layout.tsx applies
// `lang` + `dir` to <html> before React mounts so we never flash
// the wrong direction.

'use client';

import { useEffect, useState } from 'react';

export type Locale = 'en' | 'he';
export const LOCALES: { id: Locale; label: string; dir: 'ltr' | 'rtl' }[] = [
  { id: 'en', label: 'English',  dir: 'ltr' },
  { id: 'he', label: 'עברית',     dir: 'rtl' },
];

const KEY = 'ns.locale';

import en from './locales/en';
import he from './locales/he';
const TABLES: Record<Locale, Record<string, string>> = { en, he };

export function getLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'en' || v === 'he') return v;
  } catch { /* ignore */ }
  // Auto-detect Hebrew from the browser if nothing is saved yet.
  const lang = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return /^he/i.test(lang) ? 'he' : 'en';
}

export function setLocale(loc: Locale) {
  try { localStorage.setItem(KEY, loc); } catch { /* ignore */ }
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', loc);
    document.documentElement.setAttribute('dir',  loc === 'he' ? 'rtl' : 'ltr');
  }
}

export function t(key: string, locale?: Locale): string {
  const loc = locale ?? getLocale();
  return TABLES[loc][key] ?? TABLES.en[key] ?? key;
}

// Reactive variant — components that re-render on locale change.
export function useT(): { t: (key: string) => string; locale: Locale; setLocale: (l: Locale) => void } {
  const [locale, setLoc] = useState<Locale>('en');
  useEffect(() => { setLoc(getLocale()); }, []);
  return {
    locale,
    t: (key: string) => t(key, locale),
    setLocale: (l: Locale) => { setLocale(l); setLoc(l); },
  };
}
