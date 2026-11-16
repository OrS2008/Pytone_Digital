// Parental controls.
//
// What this screen controls, and where it is enforced:
//   * Channel block list (parental.blocked, synced) — applied in
//     lib/channelCache via lib/parental, so blocked channels disappear
//     from live, home, search, guide, catch-up and deep links.
//   * 4-digit PIN (per device) — when set, the block list cannot be
//     edited and blocked channels cannot be shown without it; unlocking
//     lasts one hour.
//
// Removed: the "rating cap" (providers do not publish age ratings for
// live channels, and Xtream ratings are review scores, so it could not
// be enforced) and "profiles" (stored but had no effect anywhere). Both
// were presented as working features; their stored values are kept.

'use client';

import { useCallback, useEffect, useState } from 'react';
import Shell from '../Shell';
import { useT } from '@/lib/i18n';
import { invalidateCache } from '@/lib/channelCache';
import {
  getBlocked, setBlocked, hasPin, isUnlocked, unlock, lock, setPin, clearPin, UNLOCK_MS,
} from '@/lib/parental';

export default function Parental() {
  const { t } = useT();
  const [blocked, setBlockedState] = useState<string[]>([]);
  const [pinSet, setPinSet] = useState(false);
  const [unlocked, setUnlocked] = useState(true);
  const [query, setQuery] = useState('');

  const refresh = useCallback(() => {
    setBlockedState(getBlocked());
    setPinSet(hasPin());
    setUnlocked(isUnlocked());
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener('ns-parental-changed', refresh);
    window.addEventListener('ns-settings-synced', refresh);
    return () => {
      window.removeEventListener('ns-parental-changed', refresh);
      window.removeEventListener('ns-settings-synced', refresh);
    };
  }, [refresh]);

  const editable = !pinSet || unlocked;

  function save(list: string[]) {
    setBlocked(list);
    invalidateCache();          // channel lists re-filter on next load
    refresh();
  }

  function addBlock(e: React.FormEvent) {
    e.preventDefault();
    const v = query.trim();
    if (v.length < 2 || !editable) return;
    if (!blocked.some((b) => b.toLowerCase() === v.toLowerCase())) save([...blocked, v]);
    setQuery('');
  }

  return (
    <Shell active="parental">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">{t('par.eyebrow')}</div>
        <h1 className="ac-panel-title">{t('par.title')}</h1>
        <p className="ac-panel-sub">{t('par.sub')}</p>
      </header>

      {pinSet && (
        <div className="ac-card">
          <div className="ac-card-title">{unlocked ? t('par.unlockedTitle') : t('par.lockedTitle')}</div>
          {unlocked
            ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--ns-text-muted)', fontSize: 14 }}>{t('par.unlockedBody')}</span>
                <button className="ac-btn ac-btn-sm" onClick={() => { lock(); invalidateCache(); refresh(); }}>{t('par.lockNow')}</button>
              </div>
            )
            : <UnlockForm onUnlocked={() => { invalidateCache(); refresh(); }} />}
        </div>
      )}

      <div className="ac-card">
        <div className="ac-card-title">{t('par.blockTitle')} · {blocked.length}</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, marginTop: 0 }}>{t('par.blockBody')}</p>
        <form onSubmit={addBlock}>
          <input
            className="ac-input"
            placeholder={t('par.blockPh')}
            aria-label={t('par.blockPh')}
            value={query}
            disabled={!editable}
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>
        {blocked.length === 0 ? (
          <p style={{ marginTop: 14, color: 'var(--ns-text-faint)', fontSize: 13 }}>{t('par.noneBlocked')}</p>
        ) : (
          <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {blocked.map((n) => (
              <button
                key={n}
                type="button"
                disabled={!editable}
                onClick={() => save(blocked.filter((b) => b !== n))}
                className="ac-chip-remove"
                aria-label={`${t('par.unblock')}: ${n}`}
                title={t('par.unblock')}
              >
                <bdi>{n}</bdi> <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ac-card">
        <div className="ac-card-title">{t('par.pinTitle')}</div>
        <PinManager pinSet={pinSet} editable={editable} onChange={() => { invalidateCache(); refresh(); }} />
      </div>
    </Shell>
  );
}

function UnlockForm({ onUnlocked }: { onUnlocked: () => void }) {
  const { t } = useT();
  const [pin, setPinValue] = useState('');
  const [error, setError] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (await unlock(pin)) { setPinValue(''); setError(false); onUnlocked(); }
    else { setError(true); setPinValue(''); }
  }
  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div className="ac-field" style={{ margin: 0 }}>
        <label className="ac-field-label" htmlFor="par-unlock">{t('par.enterPin')}</label>
        <input id="par-unlock" className="ac-input" type="password" inputMode="numeric" autoComplete="off" maxLength={4}
          value={pin} onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))} placeholder="••••" style={{ width: 140 }} />
      </div>
      <button type="submit" className="ac-btn ac-btn-primary">{t('par.unlock').replace('{m}', String(UNLOCK_MS / 60000))}</button>
      {error && <div className="ac-form-error" role="alert" style={{ width: '100%' }}>{t('par.wrongPin')}</div>}
    </form>
  );
}

function PinManager({ pinSet, editable, onChange }: { pinSet: boolean; editable: boolean; onChange: () => void }) {
  const { t } = useT();
  const [pin, setPinValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [armed, setArmed] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!/^\d{4}$/.test(pin)) { setMsg({ ok: false, text: t('par.errDigits') }); return; }
    if (pin !== confirm) { setMsg({ ok: false, text: t('par.errMatch') }); return; }
    try {
      await setPin(pin);
      setPinValue(''); setConfirm('');
      setMsg({ ok: true, text: t('par.pinSaved') });
      onChange();
    } catch { setMsg({ ok: false, text: t('par.errStorage') }); }
  }

  function remove() {
    if (!armed) { setArmed(true); return; }      // two-step instead of window.confirm()
    setArmed(false);
    clearPin();
    setMsg({ ok: true, text: t('par.pinRemoved') });
    onChange();
  }

  return (
    <>
      <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, margin: '0 0 16px' }}>{t('par.pinBody')}</p>
      {pinSet ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--ns-ok, #7DF9C6)', fontSize: 14, fontWeight: 600 }}>✓ {t('par.pinIsSet')}</span>
          <button className="ac-btn ac-btn-sm" onClick={remove} disabled={!editable}>
            {armed ? t('dev.confirm') : t('par.removePin')}
          </button>
          {!editable && <span style={{ color: 'var(--ns-text-faint)', fontSize: 13 }}>{t('par.unlockFirst')}</span>}
        </div>
      ) : (
        <form onSubmit={save} style={{ display: 'grid', gap: 12, maxWidth: 320 }}>
          <div className="ac-field">
            <label className="ac-field-label" htmlFor="par-new">{t('par.newPin')}</label>
            <input id="par-new" className="ac-input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={4}
              value={pin} onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
          </div>
          <div className="ac-field">
            <label className="ac-field-label" htmlFor="par-confirm">{t('par.confirmPin')}</label>
            <input id="par-confirm" className="ac-input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={4}
              value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
          </div>
          <button type="submit" className="ac-btn ac-btn-primary">{t('par.setPin')}</button>
        </form>
      )}
      {msg && (
        <div role="status" style={{ marginTop: 12, color: msg.ok ? 'var(--ns-ok, #7DF9C6)' : 'var(--ns-danger, #FF6B7B)', fontSize: 13 }}>{msg.text}</div>
      )}
    </>
  );
}
