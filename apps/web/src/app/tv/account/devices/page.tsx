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
import Link from 'next/link';
import Shell from '../Shell';
import { signOut } from '@/lib/session';
import { useAccess } from '@/lib/useAccess';

interface SessionRow {
  sid:       string;
  createdAt: number;
  userAgent: string | null;
  ip:        string | null;
  isCurrent: boolean;
}
interface SessionsResp { current: string; sessions: SessionRow[] }

function relativeTime(ms: number): string {
  const secs = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (secs < 60)             return `${secs}s ago`;
  if (secs < 3600)           return `${Math.floor(secs / 60)} min ago`;
  if (secs < 24 * 3600)      return `${Math.floor(secs / 3600)} h ago`;
  return new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Map common User-Agent strings to a friendlier label + a single-char
// glyph for the device icon. Anything we don't recognise becomes a
// generic "Browser" — far better than parading the raw UA string.
function describeUA(ua: string | null): { icon: string; name: string } {
  if (!ua) return { icon: '◍', name: 'Unknown device' };
  if (/webOS|Web0S/i.test(ua))             return { icon: '◳', name: 'LG webOS TV' };
  if (/Tizen/i.test(ua))                   return { icon: '◳', name: 'Samsung Tizen TV' };
  if (/SmartTV|HbbTV|AppleTV/i.test(ua))   return { icon: '◳', name: 'Smart TV' };
  if (/CrKey/i.test(ua))                   return { icon: '◳', name: 'Chromecast' };
  if (/iPhone|iPod/i.test(ua))             return { icon: '◰', name: 'iPhone' };
  if (/iPad/i.test(ua))                    return { icon: '◰', name: 'iPad' };
  if (/Android.*Mobile/i.test(ua))         return { icon: '◰', name: 'Android phone' };
  if (/Android/i.test(ua))                 return { icon: '◰', name: 'Android tablet' };
  if (/Macintosh/i.test(ua))               return { icon: '◬', name: 'Mac' };
  if (/Windows/i.test(ua))                 return { icon: '◬', name: 'Windows PC' };
  if (/Linux/i.test(ua))                   return { icon: '◬', name: 'Linux desktop' };
  return { icon: '◍', name: 'Browser' };
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
  const [sessions, setSessions]   = useState<SessionRow[] | null>(null);
  const [error,    setError]      = useState<string | null>(null);
  const [busy,     setBusy]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch('/api/auth/sessions', { credentials: 'include', cache: 'no-store' });
      if (r.status === 401) { setError('Sign in to see your devices.');               return; }
      if (r.status === 503) { setError('Server storage is not configured yet.');       return; }
      if (!r.ok)            { setError(`Failed to load devices (${r.status}).`);      return; }
      const body = await r.json() as SessionsResp;
      setSessions(body.sessions);
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function revoke(sid: string, isCurrent: boolean) {
    const what = isCurrent ? 'this device' : 'that device';
    if (!confirm(`Sign out ${what}?`)) return;
    setBusy(sid);
    try {
      const r = await fetch(`/api/auth/sessions/${encodeURIComponent(sid)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!r.ok) { alert(`Failed to revoke (${r.status}).`); return; }
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
    if (!confirm(`Sign out ${others.length} other device${others.length === 1 ? '' : 's'}?`)) return;
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
    access.status === 'subscribed' ? 'your subscription' :
    access.status === 'trial'      ? 'your free trial' :
    access.status === 'expired'    ? 'your expired trial' :
                                     'your account';

  return (
    <Shell active="devices">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Devices</div>
        <h1 className="ac-panel-title">Signed-in devices</h1>
        <p className="ac-panel-sub">
          Every browser or TV currently signed into {planLabel}. Sign in on a
          new device from <Link href="/tv/login" className="ac-auth-link">/tv/login</Link>{' '}
          and it appears here automatically. Revoking a device signs it out
          immediately — the next request from that browser will see a fresh
          login screen.
        </p>
      </header>

      <div className="ac-card">
        <div className="ac-card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>Active sessions {sessions ? `· ${sessions.length}` : ''}</span>
          <button className="ac-btn ac-btn-sm" onClick={load}>↻ Refresh</button>
        </div>

        {error && (
          <div style={{ color: 'var(--ns-danger, #FF6B7B)', fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {sessions === null && !error && (
          <div style={{ color: 'var(--ns-text-faint)', fontSize: 14 }}>Loading…</div>
        )}

        {sessions?.map((s) => {
          const ua = describeUA(s.userAgent);
          const browser = browserLabel(s.userAgent);
          return (
            <div key={s.sid} className={`ac-device ${s.isCurrent ? 'ac-device-active' : ''}`}>
              <div className="ac-device-icon">{ua.icon}</div>
              <div className="ac-device-meta">
                <div className="ac-device-name">
                  {ua.name}{browser ? ` · ${browser}` : ''}
                  {s.isCurrent && <span className="ac-device-tag">THIS DEVICE</span>}
                </div>
                <div className="ac-device-sub">
                  {s.ip ?? '—'} · signed in {relativeTime(s.createdAt)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="ac-btn ac-btn-sm ac-btn-danger"
                  disabled={busy === s.sid || busy === 'all'}
                  onClick={() => revoke(s.sid, s.isCurrent)}
                >
                  {busy === s.sid ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
            </div>
          );
        })}

        {sessions !== null && sessions.length === 0 && !error && (
          <p style={{ color: 'var(--ns-text-muted)', fontSize: 14 }}>
            No active sessions for this account.
          </p>
        )}
      </div>

      {sessions && sessions.length > 1 && (
        <div className="ac-card">
          <div className="ac-card-title">Sign out everywhere else</div>
          <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, margin: '0 0 14px' }}>
            Revokes every session except the one you&apos;re using right now.
            Useful if you signed in on a public device and forgot to sign
            out.
          </p>
          <button
            className="ac-btn ac-btn-danger"
            disabled={busy === 'all'}
            onClick={revokeAllOthers}
          >
            {busy === 'all'
              ? 'Signing out other devices…'
              : `Sign out ${sessions.filter((s) => !s.isCurrent).length} other device(s)`}
          </button>
        </div>
      )}
    </Shell>
  );
}
