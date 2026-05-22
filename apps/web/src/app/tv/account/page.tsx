// Account overview — the landing card. Shows the real sources the user
// has configured (via /tv/account/sources), the email signed in, and
// device + subscription summaries. All data is read at mount from
// localStorage scoped by the current tenant (lib/session) so two users
// sharing the same browser never see each other's settings.
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from './Shell';
import { getSessionEmail, signOut, tenantId } from '@/lib/session';
import { userKey } from '@/lib/session';

interface Source { id: string; kind: string; title: string; sub: string; stat: string; }

function readSources(key: string): Source[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(userKey(key));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export default function AccountOverview() {
  const [email, setEmail] = useState<string | null>(null);
  const [live,  setLive]  = useState<Source[]>([]);
  const [epg,   setEpg]   = useState<Source[]>([]);
  const [vod,   setVod]   = useState<Source[]>([]);
  const [tid,   setTid]   = useState<string>('anon');

  useEffect(() => {
    setEmail(getSessionEmail());
    setTid(tenantId());
    setLive(readSources('sources.live'));
    setEpg(readSources('sources.epg'));
    setVod(readSources('sources.vod'));
  }, []);

  const initials = email
    ? email.split('@')[0].slice(0, 2).toUpperCase()
    : '—';
  const displayName = email ? email.split('@')[0] : 'Guest';

  return (
    <Shell active="overview">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Account</div>
        <h1 className="ac-panel-title">Hi, {displayName}</h1>
        <p className="ac-panel-sub">
          Manage your subscription, devices and content sources from one place.
        </p>
      </header>

      <div className="ac-banner">
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
            {email
              ? <>Signed in as <span className="ac-banner-strong">{email}</span></>
              : <>You&apos;re not signed in</>}
          </div>
          <div style={{ color: 'var(--ns-text-muted)', fontSize: 14 }}>
            {email
              ? <>Tenant <code style={{ fontFamily: 'var(--ns-font-mono)', color: 'var(--ns-text-faint)' }}>{tid}</code> · your data is isolated from other accounts on this browser.</>
              : <>Sign in so your playlist, EPG and preferences stay tied to you and not to whoever else uses this browser.</>}
          </div>
        </div>
        {email
          ? <button className="ac-btn" onClick={signOut}>Sign out</button>
          : <Link href="/tv/login" className="ac-btn ac-btn-primary">Sign in</Link>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }} className="ac-sub-grid">
        <div>
          <div className="ac-card">
            <div className="ac-card-title">Account</div>
            <dl className="ac-detail">
              <dt>Email</dt><dd>{email ?? '—'}</dd>
              <dt>Tenant ID</dt><dd style={{ fontFamily: 'var(--ns-font-mono)', fontSize: 13 }}>{tid}</dd>
              <dt>Storage</dt><dd>Browser localStorage (demo) · backend isolation lands with the auth service deploy.</dd>
            </dl>
          </div>

          <div className="ac-card">
            <div className="ac-card-title">Your content sources</div>

            {live.length === 0 && epg.length === 0 && vod.length === 0 && (
              <p style={{ color: 'var(--ns-text-muted)', fontSize: 14 }}>
                You haven&apos;t added any sources yet. Head to{' '}
                <Link className="ac-auth-link" href="/tv/account/sources">Playlists &amp; EPG</Link>{' '}
                to connect your M3U / Xtream provider.
              </p>
            )}

            {live.map((s) => (
              <div key={s.id} className="ac-source">
                <div className="ac-source-icon">{s.kind}</div>
                <div className="ac-source-meta">
                  <div className="ac-source-title">{s.title}</div>
                  <div className="ac-source-url">{s.sub}</div>
                </div>
                <div className="ac-source-stats"><div>{s.stat}</div></div>
                <Link href="/tv/account/sources" className="ac-btn ac-btn-sm">Manage</Link>
              </div>
            ))}
            {epg.map((s) => (
              <div key={s.id} className="ac-source">
                <div className="ac-source-icon" style={{ background: 'rgba(125,249,198,0.10)', color: 'var(--ns-ok)' }}>{s.kind}</div>
                <div className="ac-source-meta">
                  <div className="ac-source-title">{s.title}</div>
                  <div className="ac-source-url">{s.sub}</div>
                </div>
                <div className="ac-source-stats"><div>{s.stat}</div></div>
                <Link href="/tv/account/sources" className="ac-btn ac-btn-sm">Manage</Link>
              </div>
            ))}
            {vod.map((s) => (
              <div key={s.id} className="ac-source">
                <div className="ac-source-icon" style={{ background: 'rgba(139,92,246,0.14)', color: 'var(--ns-accent-2)' }}>{s.kind}</div>
                <div className="ac-source-meta">
                  <div className="ac-source-title">{s.title}</div>
                  <div className="ac-source-url">{s.sub}</div>
                </div>
                <div className="ac-source-stats"><div>{s.stat}</div></div>
                <Link href="/tv/account/sources" className="ac-btn ac-btn-sm">Manage</Link>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="ac-card">
            <div className="ac-card-title">Current plan</div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>Free Trial</div>
            <div style={{ color: 'var(--ns-text-muted)', fontSize: 14, marginTop: 4 }}>
              Single device · 7 days from sign-up
            </div>
            <Link href="/tv/account/plans" style={{ display: 'block', marginTop: 16 }} className="ac-btn ac-btn-primary">
              See plans →
            </Link>
          </div>
          <div className="ac-card">
            <div className="ac-card-title">Active devices</div>
            <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums' }}>
              1<span style={{ color: 'var(--ns-text-faint)', fontSize: 24, fontWeight: 500 }}> / 1</span>
            </div>
            <div style={{ color: 'var(--ns-text-muted)', fontSize: 14 }}>This browser</div>
            <Link href="/tv/account/devices" style={{ display: 'block', marginTop: 16 }} className="ac-btn">
              Manage devices
            </Link>
          </div>
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--ns-text-faint)', marginTop: 20, lineHeight: 1.6 }}>
        <b>Privacy note:</b> on this demo deploy your sources live in this browser&apos;s
        localStorage, keyed by the email you sign in with. Two accounts on the same
        browser see two completely separate data sets, but anyone with physical access
        to the browser profile can still read both. True cryptographic isolation comes
        from the auth-service + Postgres pair under <code>services/auth/</code> — the
        schema is ready, deploying it is the next step.
      </p>
    </Shell>
  );
}
