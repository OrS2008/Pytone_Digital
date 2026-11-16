// Security — change password + recent activity.
//
// What we removed in the cleanup pass:
//   * "Two-factor authentication" (3 toggles for authenticator app /
//     SMS / Passkey) — no backend, the buttons just flashed "Setup
//     started ✓". Listing them implied features that don't exist,
//     so they're gone. When 2FA is real we'll add them back as a
//     single, working card.
//   * "Recent activity" used to render a fabricated row. It now
//     reports only the current session, with a note explaining why
//     the rest of the history will become available once session
//     indexing per user lands server-side.
//
// What's real now:
//   * Change password posts to /api/auth/change-password, which
//     verifies the current password against the KV-stored hash and
//     writes a fresh one. Errors come through as actual messages
//     (wrong current password, weak new password, etc) instead of
//     the form's previous always-success behaviour.
'use client';

import { useEffect, useState } from 'react';
import Shell from '../Shell';
import { getCurrentDevice } from '@/lib/deviceFingerprint';
import { useT } from '@/lib/i18n';

export default function Security() {
  const { t } = useT();
  const [current, setCurrent] = useState('');
  const [next, setNext]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy]       = useState(false);
  const [msg, setMsg]         = useState<{ ok: boolean; text: string } | null>(null);

  const [deviceLabel, setDeviceLabel] = useState<string>('—');
  useEffect(() => { setDeviceLabel(getCurrentDevice().name); }, []);

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (current.length < 1) return setMsg({ ok: false, text: t('sec.errCurrent') });
    if (next.length < 8)    return setMsg({ ok: false, text: t('sec.errLength') });
    if (next !== confirm)   return setMsg({ ok: false, text: t('sec.errMatch') });
    if (current === next)   return setMsg({ ok: false, text: t('sec.errSame') });

    setBusy(true);
    try {
      const r = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (r.status === 401) { setMsg({ ok: false, text: t('sec.errSignIn') }); return; }
      if (r.status === 403) { setMsg({ ok: false, text: t('sec.errWrong') }); return; }
      if (r.status === 422) {
        const body = await r.json().catch(() => ({} as { error?: string }));
        setMsg({ ok: false, text: body.error === 'same_password' ? t('sec.errSame') : t('sec.errWeak') });
        return;
      }
      if (r.status === 503) { setMsg({ ok: false, text: t('sec.errStorage') }); return; }
      if (!r.ok)            { setMsg({ ok: false, text: `${t('sec.errFailed')} (${r.status}).` }); return; }
      setMsg({ ok: true, text: t('sec.ok') });
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err) {
      setMsg({ ok: false, text: `${t('auth.errNetwork')}: ${(err as Error).message}` });
    } finally { setBusy(false); }
  }

  return (
    <Shell active="security">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">{t('sec.eyebrow')}</div>
        <h1 className="ac-panel-title">{t('sec.title')}</h1>
        <p className="ac-panel-sub">
          {t('sec.sub')}
        </p>
      </header>

      <div className="ac-card" style={{ maxWidth: 520 }}>
        <div className="ac-card-title">{t('sec.change')}</div>
        <form onSubmit={updatePassword}>
          <div className="ac-field">
            <label className="ac-field-label">{t('sec.current')}</label>
            <input
              type="password" className="ac-input"
              placeholder="••••••••"
              value={current} onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="ac-field">
            <label className="ac-field-label">{t('sec.new')}</label>
            <input
              type="password" className="ac-input"
              placeholder={t('sec.newPh')}
              value={next} onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
            <div className="ac-field-help">
              {t('sec.newHelp')}
            </div>
          </div>
          <div className="ac-field">
            <label className="ac-field-label">{t('sec.confirm')}</label>
            <input
              type="password" className="ac-input"
              placeholder={t('sec.confirmPh')}
              value={confirm} onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          {msg && (
            <div style={{
              fontSize: 13, padding: '8px 0',
              color: msg.ok ? 'var(--ns-ok, #7DF9C6)' : 'var(--ns-danger, #FF6B7B)',
            }}>{msg.text}</div>
          )}
          <button type="submit" className="ac-btn ac-btn-primary" disabled={busy}>
            {busy ? t('sec.updating') : t('sec.update')}
          </button>
        </form>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">{t('sec.activity')}</div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '24px 1fr auto 80px',
          gap: 16, padding: '10px 0', alignItems: 'center',
          fontSize: 14,
        }}>
          <span style={{ color: 'var(--ns-text-faint)' }}>◯</span>
          <div>
            <div style={{ color: 'var(--ns-text)' }}>{t('sec.signedIn')}</div>
            <div style={{ color: 'var(--ns-text-faint)', fontSize: 12 }}>{deviceLabel}</div>
          </div>
          <div style={{ color: 'var(--ns-text-muted)', fontSize: 13 }}>{t('sec.thisSession')}</div>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 1,
            color: 'var(--ns-ok)',
          }}>{t('sec.success')}</div>
        </div>
        <p style={{ marginTop: 14, color: 'var(--ns-text-faint)', fontSize: 12, lineHeight: 1.5 }}>
          {t('sec.activityNote')}
        </p>
      </div>
    </Shell>
  );
}
