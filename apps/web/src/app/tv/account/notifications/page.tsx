'use client';

// Notifications — an honest list of what Nova Stream sends today and what
// is planned. No toggles for things that are not wired up.

import Link from 'next/link';
import Shell from '../Shell';
import { useT } from '@/lib/i18n';

const TODAY = ['activation', 'trialEnded'] as const;
const PLANNED = ['newSignin', 'trialEnding', 'teamMatch'] as const;

export default function Notifications() {
  const { t } = useT();
  const row = (k: string, tone: 'ok' | 'mut', label: string) => (
    <div key={k} style={{ padding: '12px 0', borderTop: '1px solid var(--ns-hairline)' }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ns-text)' }}>
        <span className={`ac-status-pill ac-status-${tone}`} style={{ fontSize: 10, marginInlineEnd: 10 }}>{label}</span>
        {t(`ntf.${k}.title`)}
      </div>
      <div style={{ fontSize: 13, color: 'var(--ns-text-muted)', marginTop: 4 }}>{t(`ntf.${k}.detail`)}</div>
    </div>
  );
  return (
    <Shell active="notifications">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">{t('ntf.eyebrow')}</div>
        <h1 className="ac-panel-title">{t('ntf.title')}</h1>
        <p className="ac-panel-sub">{t('ntf.sub')}</p>
      </header>
      <div className="ac-card">
        <div className="ac-card-title">{t('ntf.today')}</div>
        {TODAY.map((k) => row(k, 'ok', t('ntf.active')))}
      </div>
      <div className="ac-card">
        <div className="ac-card-title">{t('ntf.planned')}</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 13.5, margin: '0 0 12px' }}>{t('ntf.plannedNote')}</p>
        {PLANNED.map((k) => row(k, 'mut', t('ntf.plannedPill')))}
      </div>
      <div className="ac-card">
        <div className="ac-card-title">{t('ntf.sound')}</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, margin: 0 }}>{t('ntf.soundBody')}</p>
      </div>
      <div className="ac-card">
        <div className="ac-card-title">{t('ntf.marketing')}</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, margin: '0 0 14px' }}>
          {t('ntf.marketingBody')}{' '}
          <Link href="/legal/privacy" className="ac-auth-link">{t('wl.privacy')}</Link>
        </p>
      </div>
    </Shell>
  );
}
