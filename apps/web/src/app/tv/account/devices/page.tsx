// Devices — every browser / TV currently signed into the account.
//
// Backed by /api/auth/sessions which walks user_sessions:<userId>:*
// (the index createSession writes alongside the canonical session
// record). For every active session we display the User-Agent the
// session was created with, the IP it came from, and the age. "Sign
// out" calls DELETE /api/auth/sessions/<sid> which validates that
// the caller owns the session before revoking.
//
// What we removed in the previous cleanup pass but keep noted here:
// no fake "Email me on every new sign-in" / "Auto-revoke after 60d"
// toggles. Listing only real sessions; revoking actually revokes.

'use client';

import { useCallback, useEffect, useState } from 'react';
import Shell from '../Shell';
import { signOut } from '@/lib/session';
import { useAccess } from '@/lib/useAccess';
import { useT, getLocale } from '@/lib/i18n';

interface SessionRow {
  sid:       string;
  createdAt: number;
  userAgent: string | null;
  ip:        string | null;
  isCurrent: boolean;
}
interface SessionsResp { current: string; sessions: SessionRow[] }

function relativeTime(ms: number, t: (k: string) => string): string {
  const secs = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (secs < 60)             return `${secs}${t('dev.sAgo')}`;
  if (secs < 3600)           return `${Math.floor(secs / 60)} ${t('dev.minAgo').trim()}`;
  if (secs < 24 * 3600)      return `${Math.floor(secs / 3600)} ${t('dev.hAgo').trim()}`;
  return new Date(ms).toLocaleDateString(getLocale() === 'he' ? 'he-IL' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Map common User-Agent strings to a friendlier label + a single-char
// glyph for the device icon. Anything we don't recognise becomes a
// generic "Browser" — far better than parading the raw UA string.
function describeUA(ua: string | null): { icon: string; name: string } {
  if (!ua) return { icon: '◍', name: 'dev.n.unknown' };
  if (/webOS|Web0S/i.test(ua))             return { icon: '◳', name: 'dev.n.webos' };
  if (/Tizen/i.test(ua))                   return { icon: '◳', name: 'dev.n.tizen' };
  if (/SmartTV|HbbTV|AppleTV/i.test(ua))   return { icon: '◳', name: 'dev.n.smarttv' };
  if (/CrKey/i.test(ua))                   return { icon: '◳', name: 'dev.n.chromecast' };
  if (/iPhone|iPod/i.test(ua))             return { icon: '◰', name: 'dev.n.iphone' };
  if (/iPad/i.test(ua))                    return { icon: '◰', name: 'dev.n.ipad' };
  if (/Android.*Mobile/i.test(ua))         return { icon: '◰', name: 'dev.n.androidPhone' };
  if (/Android/i.test(ua))                 return { icon: '◰', name: 'dev.n.androidTablet' };
  if (/Macintosh/i.test(ua))               return { icon: '◬', name: 'dev.n.mac' };
  if (/Windows/i.test(ua))                 return { icon: '◬', name: 'dev.n.windows' };
  if (/Linux/i.test(ua))                   return { icon: '◬', name: 'dev.n.linux' };
  return { icon: '◍', name: 'dev.n.browser' };
}

function browserLabel(ua: string | null): string {
  if (!ua) return '';
  if (/Edg\//i.test(ua))                       return 'Edge';
  if (/OPR\/|Opera/i.test(ua))                 return 'Opera';
  if (/Chrome\/.*Safari/i.test(ua))            return 'Chrome';
  if (/Firefox\//i.test(ua))                   return 'Firefox';
  if (/Safari\//i.test(ua))                    return 'Safari';
  return '';
}

export default function Devices() {
  const access = useAccess();
  const { t } = useT();
  // Two-step confirmation in the page itself. window.confirm()/alert()
  // are unreliable inside the Android WebView (the same family of
  // dialogs as prompt(), which rendered without an input field there).
  const [armed, setArmed] = useState<string | null>(null);
  const [sessions, setSessions]   = useState<SessionRow[] | null>(null);
  const [error,    setError]      = useState<string | null>(null);
  const [busy,     setBusy]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch('/api/auth/sessions', { credentials: 'include', cache: 'no-store' });
      if (r.status === 401) { setError(t('dev.errSignIn'));               return; }
      if (r.status === 503) { setError(t('dev.errStorage'));       return; }
      if (!r.ok)            { setError(`${t('dev.errLoad')} (${r.status}).`);      return; }
      const body = await r.json() as SessionsResp;
      setSessions(body.sessions);
    } catch (e) {
      setError(`${t('auth.errNetwork')}: ${(e as Error).message}`);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function revoke(sid: string, isCurrent: boolean) {
    if (armed !== sid) { setArmed(sid); return; }
    setArmed(null);
    setBusy(sid);
    try {
      const r = await fetch(`/api/auth/sessions/${encodeURIComponent(sid)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!r.ok) { setError(`${t('dev.errRevoke')} (${r.status}).`); return; }
      if (isCurrent) {
        // Server cleared the cookie; navigate to login so this tab
        // doesn't keep rendering protected screens off stale state.
        signOut();
        return;
      }
      await load();
    } finally { setBusy(null); }
  }

  async function revokeAllOthers() {
    if (!sessions) return;
    const others = sessions.filter((s) => !s.isCurrent);
    if (others.length === 0) return;
    if (armed !== 'all') { setArmed('all'); return; }
    setArmed(null);
    setBusy('all');
    try {
      await Promise.all(others.map((s) =>
        fetch(`/api/auth/sessions/${encodeURIComponent(s.sid)}`, {
          method: 'DELETE',
          credentials: 'include',
        }),
      ));
      await load();
    } finally { setBusy(null); }
  }

  const planLabel =
    access.status === 'subscribed' ? t('dev.planSub') :
    access.status === 'trial'      ? t('dev.planTrial') :
    access.status === 'expired'    ? t('dev.planExpired') :
                                     t('dev.planAccount');

  return (
    <Shell active="devices">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">{t('dev.eyebrow')}</div>
        <h1 className="ac-panel-title">{t('dev.title')}</h1>
        <p className="ac-panel-sub">
          {t('dev.sub1')} {planLabel}{t('dev.sub2')}
        </p>
      </header>

      <div className="ac-card">
        <div className="ac-card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>{t('dev.active')} {sessions ? `· ${sessions.length}` : ''}</span>
          <button className="ac-btn ac-btn-sm" onClick={load}>{t('dev.refresh')}</button>
        </div>

        {error && (
          <div style={{ color: 'var(--ns-danger, #FF6B7B)', fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {sessions === null && !error && (
          <div style={{ color: 'var(--ns-text-faint)', fontSize: 14 }}>{t('acc.loading')}</div>
        )}

        {sessions?.map((s) => {
          const ua = describeUA(s.userAgent);
          const browser = browserLabel(s.userAgent);
          return (
            <div key={s.sid} className={`ac-device ${s.isCurrent ? 'ac-device-active' : ''}`}>
              <div className="ac-device-icon">{ua.icon}</div>
              <div className="ac-device-meta">
                <div className="ac-device-name">
                  {t(ua.name)}{browser ? ` · ${browser}` : ''}
                  {s.isCurrent && <span className="ac-device-tag">{t('dev.thisDevice')}</span>}
                </div>
                <div className="ac-device-sub">
                  <bdi>{s.ip ?? '—'}</bdi> · {t('dev.signedIn')} {relativeTime(s.createdAt, t)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="ac-btn ac-btn-sm ac-btn-danger"
                  disabled={busy === s.sid || busy === 'all'}
                  onClick={() => revoke(s.sid, s.isCurrent)}
                >
                  {busy === s.sid ? t('dev.signingOut') : armed === s.sid ? t('dev.confirm') : t('dev.signOut')}
                </button>
              </div>
            </div>
          );
        })}

        {sessions !== null && sessions.length === 0 && !error && (
          <p style={{ color: 'var(--ns-text-muted)', fontSize: 14 }}>
            {t('dev.none')}
          </p>
        )}
      </div>

      {sessions && sessions.length > 1 && (
        <div className="ac-card">
          <div className="ac-card-title">{t('dev.everywhere')}</div>
          <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, margin: '0 0 14px' }}>
            {t('dev.everywhereBody')}
          </p>
          <button
            className="ac-btn ac-btn-danger"
            disabled={busy === 'all'}
            onClick={revokeAllOthers}
          >
            {busy === 'all'
              ? t('dev.signingOutOthers')
              : armed === 'all'
                ? t('dev.confirm')
                : `${t('dev.signOutOthers')} · ${sessions.filter((s) => !s.isCurrent).length}`}
          </button>
        </div>
      )}
    </Shell>
  );
}
