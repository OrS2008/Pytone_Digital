'use client';

// Shared frame for the legal pages: language switch (English / Hebrew),
// correct direction per language, fixed "last updated" date, and the
// Hebrew notice that the English text prevails until legal review.

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { getLocale, setLocale, type Locale } from '@/lib/i18n';
import '../tv/account/account.css';

export const LEGAL_UPDATED = { en: '16 November 2026', he: '16 בנובמבר 2026' };

export default function LegalShell({ initialLocale, title, en, he }: {
  initialLocale: Locale;
  title: { en: string; he: string };
  en: ReactNode;
  he: ReactNode;
}) {
  const [loc, setLoc] = useState<Locale>(initialLocale);
  useEffect(() => { setLoc(getLocale()); }, []);
  const isHe = loc === 'he';
  return (
    <main className="ac-auth legal" dir={isHe ? 'rtl' : 'ltr'} lang={loc} style={{ alignItems: 'flex-start', padding: '64px 24px' }}>
      <div className="ac-auth-card" style={{ maxWidth: 760 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div className="ac-auth-wm">NOVA STREAM</div>
          <div role="group" aria-label="Language" style={{ display: 'flex', gap: 6 }}>
            {(['en', 'he'] as const).map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={loc === l}
                onClick={() => { setLocale(l); setLoc(l); }}
                className="ac-btn ac-btn-sm"
                style={loc === l ? { background: 'var(--ns-accent, #FF3B6E)', color: '#fff', borderColor: 'transparent' } : undefined}
              >{l === 'en' ? 'English' : 'עברית'}</button>
            ))}
          </div>
        </div>
        <h1 className="ac-auth-title" style={{ marginTop: 12 }}>{isHe ? title.he : title.en}</h1>
        <p className="ac-auth-sub" style={{ marginBottom: 24 }}>
          {isHe ? 'עודכן לאחרונה' : 'Last updated'} · {isHe ? LEGAL_UPDATED.he : LEGAL_UPDATED.en}
        </p>
        {isHe && (
          <p style={{ fontSize: 13, color: 'var(--ns-text-muted)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px' }}>
            התרגום לעברית נועד לנוחותכם. במקרה של סתירה בין הנוסח העברי לנוסח האנגלי, הנוסח האנגלי הוא הקובע.
          </p>
        )}
        <section style={{ lineHeight: 1.7 }}>{isHe ? he : en}</section>
        <div className="ac-auth-bottom" style={{ marginTop: 40 }}>
          <Link href="/tv/signup" className="ac-auth-link">{isHe ? '→ חזרה להרשמה' : '← Back to sign-up'}</Link>
        </div>
      </div>
    </main>
  );
}
