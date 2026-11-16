'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '../Shell';
import ActionButton from '@/components/ui/ActionButton';
import { signOut } from '@/lib/session';
import { useT } from '@/lib/i18n';
import { getCurrentDevice } from '@/lib/deviceFingerprint';

const LEGAL = [
  { label: 'help.terms',   href: '/legal/terms'   },
  { label: 'help.privacy', href: '/legal/privacy' },
];

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID || 'dev';

export default function Help() {
  const { t } = useT();
  const [diag, setDiag] = useState({ device: '—', screen: '—' });
  useEffect(() => { setDiag({ device: getCurrentDevice().name, screen: `${window.innerWidth}×${window.innerHeight}` }); }, []);
  const [confirming, setConfirming] = useState(false);
  const [deleted,    setDeleted]    = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting,   setDeleting]   = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exporting,  setExporting]  = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // GDPR Art. 15 / 20. Fetches the JSON dump from /api/privacy/export.
  // The endpoint sets Content-Disposition: attachment, so we drive a
  // hidden <a> click to make the browser save it under the right
  // filename. We can't just window.location.assign() because that
  // would replace the current page if the response failed.
  async function handleExport() {
    setExportError(null);
    setExporting(true);
    try {
      const r = await fetch('/api/privacy/export', { credentials: 'include' });
      if (r.status === 401) {
        setExportError(t('help.errExportSignIn'));
        return;
      }
      if (r.status === 503) {
        setExportError(t('help.errUnavailable'));
        return;
      }
      if (!r.ok) {
        setExportError(`${t('help.errExport')} (${r.status}).`);
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nova-stream-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke after the browser has a chance to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setExportError(`${t('help.errExport')}: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  // GDPR Art. 17. Wipes the user record, settings blob, and current
  // session server-side. The server also clears the ns_session cookie.
  // On success we drop our client-side session pointer too and bounce
  // to /tv/login so the next paint can't accidentally read stale
  // localStorage as if the user were still signed in.
  async function handleDelete() {
    setDeleteError(null);
    if (deletePassword.length < 8) {
      setDeleteError(t('help.errPassword'));
      return;
    }
    setDeleting(true);
    try {
      const r = await fetch('/api/privacy/delete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      });
      if (r.status === 401) {
        const body = await r.json().catch(() => ({})) as { error?: string };
        setDeleteError(body.error === 'wrong_password'
          ? t('help.errWrongPassword')
          : t('help.errDeleteSignIn'));
        return;
      }
      if (r.status === 503) {
        setDeleteError(t('help.errUnavailable'));
        return;
      }
      if (!r.ok) {
        const body = await r.json().catch(() => ({})) as { detail?: string };
        setDeleteError(`${t('help.errDelete')} (${r.status})${body.detail ? `: ${body.detail}` : '.'}`);
        return;
      }
      setDeleted(true);
      setConfirming(false);
      setDeletePassword('');
      // signOut() clears local session and navigates to /tv/login.
      // Fire after a short pause so the user sees the DELETED chip.
      setTimeout(() => { signOut(); }, 1200);
    } catch (err) {
      setDeleteError(`${t('help.errDelete')}: ${(err as Error).message}`);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Shell active="help">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">{t('help.eyebrow')}</div>
        <h1 className="ac-panel-title">{t('help.title')}</h1>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 18 }} className="ac-help-grid">
        <div className="ac-card">
          <div className="ac-card-title">{t('help.support')}</div>
          <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, marginTop: 0 }}>{t('help.supportBody')}</p>
          <a className="ac-btn" href="mailto:support@novastream.tv"><bdi>✉️  support@novastream.tv</bdi></a>
        </div>
        <div className="ac-card">
          <div className="ac-card-title">{t('help.diag')}</div>
          <dl className="ac-detail">
            <dt>{t('help.version')}</dt><dd dir="ltr">{BUILD}</dd>
            <dt>{t('help.device')}</dt><dd>{diag.device}</dd>
            <dt>{t('help.screen')}</dt><dd dir="ltr">{diag.screen}</dd>
          </dl>
          <ActionButton
            className="ac-btn ac-btn-sm"
            style={{ marginTop: 14 }}
            doneLabel={t('help.copied')}
            onAction={() => { navigator.clipboard?.writeText(`Nova Stream ${BUILD}\nUser agent: ${navigator.userAgent}\nScreen: ${diag.screen}`); }}
          >{t('help.copy')}</ActionButton>
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">{t('help.legal')}</div>
        {LEGAL.map((it, i) => (
          <Link key={it.label} href={it.href} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 0', borderTop: i === 0 ? '0' : '1px solid var(--ns-hairline)',
            color: 'var(--ns-text)', textDecoration: 'none',
          }}>
            <span>{t(it.label)}</span>
            <span style={{ color: 'var(--ns-text-faint)' }} aria-hidden="true">›</span>
          </Link>
        ))}
      </div>

      <div className="ac-card ac-btn-danger" style={{ borderRadius: 14 }}>
        <div className="ac-card-title" style={{ color: 'inherit' }}>{t('help.danger')}</div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">{t('help.export')}</div>
            <div className="ac-toggle-desc">
              {t('help.exportBody')}
            </div>
            {exportError && (
              <div style={{ color: 'var(--ns-danger, #FF6B7B)', fontSize: 12, marginTop: 6 }}>
                {exportError}
              </div>
            )}
          </div>
          <button
            type="button"
            className="ac-btn ac-btn-sm"
            disabled={exporting}
            onClick={handleExport}
          >
            {exporting ? t('help.preparing') : t('help.download')}
          </button>
        </div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">{t('help.delete')}</div>
            <div className="ac-toggle-desc">
              {deleted
                ? t('help.deleted')
                : t('help.deleteBody')}
            </div>
            {deleteError && (
              <div style={{ color: 'var(--ns-danger, #FF6B7B)', fontSize: 12, marginTop: 6 }}>
                {deleteError}
              </div>
            )}
          </div>
          {deleted ? (
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'var(--ns-text-faint)' }}>{t('help.deletedPill')}</span>
          ) : confirming ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
              <input
                type="password"
                autoComplete="current-password"
                placeholder={t('help.confirmPh')}
                aria-label={t('help.confirmPh')}
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                disabled={deleting}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: '#E9EBF1',
                  fontSize: 13,
                  minWidth: 240,
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="ac-btn ac-btn-sm"
                  onClick={() => { setConfirming(false); setDeletePassword(''); setDeleteError(null); }}
                  disabled={deleting}
                >{t('src.cancel')}</button>
                <button
                  className="ac-btn ac-btn-sm ac-btn-danger"
                  onClick={handleDelete}
                  disabled={deleting}
                >{deleting ? t('help.deleting') : t('help.yesDelete')}</button>
              </div>
            </div>
          ) : (
            <button className="ac-btn ac-btn-sm ac-btn-danger" onClick={() => setConfirming(true)}>
              {t('help.startDelete')}
            </button>
          )}
        </div>
      </div>
    </Shell>
  );
}
