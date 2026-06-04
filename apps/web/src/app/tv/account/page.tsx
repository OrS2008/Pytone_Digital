// Account overview.
//
// Single screen, real data only. Pulled from:
//   * /api/auth/me           — user record + trial / subscription access
//   * channelCache + localStorage — content stats (sources, channels)
//   * usePersisted prefs.streamMode — active streaming mode
//
// No hardcoded numbers, no fake "Member since today", no raw M3U URLs
// (which embed user:pass and were leaking credentials in plain text).
// What we cannot prove from real state, we don't render.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from './Shell';
import { signOut } from '@/lib/session';
import { useAccess } from '@/lib/useAccess';
import { getCachedChannels } from '@/lib/channelCache';
import { userKey } from '@/lib/session';

interface Source { id: string; kind: string; title: string; sub: string; stat: string }

function readSources(key: string): Source[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(userKey(key));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function readPref<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(userKey(key));
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch { return fallback; }
}

function formatDate(ms: number | undefined | null): string {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatDateTime(ms: number | undefined | null): string {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
         ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// Hide the user:pass / token portion of a credential-bearing URL so it
// can be displayed on screen without leaking the subscription password.
//
// http://provider.tv/get.php?username=foo&password=bar&type=m3u
//   → provider.tv/get.php?username=***&password=***
//
// http://host:1600/s/llftbjm2/eurosport1/video.m3u8
//   → host:1600/s/***/eurosport1/video.m3u8
function maskSourceUrl(raw: string): string {
  if (!raw) return '';
  if (raw.startsWith('local:')) return '📁 Uploaded file';
  try {
    const u = new URL(raw);
    const params = u.searchParams;
    for (const key of ['username', 'password', 'pass', 'token']) {
      if (params.has(key)) params.set(key, '***');
    }
    let path = u.pathname;
    path = path.replace(/\/s\/[^/]+(?=\/)/, '/s/***');
    return `${u.host}${path}${params.toString() ? '?' + params.toString() : ''}`;
  } catch { return raw; }
}

export default function AccountOverview() {
  const access = useAccess();

  const [live,    setLive]    = useState<Source[]>([]);
  const [epg,     setEpg]     = useState<Source[]>([]);
  const [vod,     setVod]     = useState<Source[]>([]);
  const [chanN,   setChanN]   = useState<number>(0);
  const [mode,    setMode]    = useState<'proxy' | 'direct'>('proxy');
  const [lastSync, setLastSync] = useState<number | null>(null);

  useEffect(() => {
    setLive(readSources('sources.live'));
    setEpg(readSources('sources.epg'));
    setVod(readSources('sources.vod'));
    setMode(readPref<'proxy' | 'direct'>('prefs.streamMode', 'proxy'));
    setChanN(getCachedChannels()?.length ?? 0);

    // ns-settings-synced fires after a successful sync round-trip.
    function onSynced() { setLastSync(Date.now()); }
    window.addEventListener('ns-settings-synced', onSynced);
    return () => window.removeEventListener('ns-settings-synced', onSynced);
  }, []);

  const displayName = access.email ? access.email.split('@')[0] : null;

  return (
    <Shell active="overview">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Account</div>
        <h1 className="ac-panel-title">
          {access.status === 'loading' ? 'Loading…' : displayName ? `Hi, ${displayName}` : 'Account'}
        </h1>
        <p className="ac-panel-sub">
          Your subscription, devices and content sources — all in one place.
        </p>
      </header>

      <StatusBanner access={access} />

      <div className="ac-overview-grid">
        <AccountCard access={access} />
        <SubscriptionCard access={access} />
        <ContentCard
          liveCount={live.length}
          epgCount={epg.length}
          vodCount={vod.length}
          channelCount={chanN}
          mode={mode}
        />
      </div>

      <SourcesCard live={live} epg={epg} vod={vod} />

      <SyncCard lastSync={lastSync} />

      <QuickActions access={access} />
    </Shell>
  );
}

// ─── Status banner — the single big "what's happening with my access" ──

function StatusBanner({ access }: { access: ReturnType<typeof useAccess> }) {
  if (access.status === 'loading') {
    return <div className="ac-banner ac-banner-loading">Loading account…</div>;
  }
  if (access.status === 'anon') {
    return null; // AccountGate already shows the sign-in wall.
  }
  if (access.status === 'error') {
    return (
      <div className="ac-banner ac-banner-warn">
        <div>
          <div className="ac-banner-h">We couldn&apos;t reach the server</div>
          <div className="ac-banner-sub">Your local settings still work — refresh to retry.</div>
        </div>
      </div>
    );
  }
  if (access.status === 'subscribed') {
    return (
      <div className="ac-banner ac-banner-ok">
        <div>
          <span className="ac-status-pill ac-status-ok">SUBSCRIBED</span>
          <div className="ac-banner-h" style={{ marginTop: 8 }}>You&apos;re all set.</div>
          <div className="ac-banner-sub">
            Renews on {formatDate(access.subscribedUntil)} · Cancel any time.
          </div>
        </div>
        <Link href="/tv/account/subscription" className="ac-btn">Manage subscription</Link>
      </div>
    );
  }
  if (access.status === 'trial') {
    const days = access.daysLeft ?? 0;
    return (
      <div className="ac-banner ac-banner-info">
        <div>
          <span className="ac-status-pill ac-status-trial">FREE TRIAL · {days}d LEFT</span>
          <div className="ac-banner-h" style={{ marginTop: 8 }}>
            {days <= 1 ? 'Your trial ends soon.' : `${days} days of free streaming remaining.`}
          </div>
          <div className="ac-banner-sub">
            Trial ends on {formatDate(access.trialEndsAt)} · Subscribe before then to keep your settings.
          </div>
        </div>
        <Link href="/tv/account/plans" className="ac-btn ac-btn-primary">Subscribe</Link>
      </div>
    );
  }
  // expired
  return (
    <div className="ac-banner ac-banner-warn">
      <div>
        <span className="ac-status-pill ac-status-warn">EXPIRED</span>
        <div className="ac-banner-h" style={{ marginTop: 8 }}>Your free trial has ended.</div>
        <div className="ac-banner-sub">
          Trial ended on {formatDate(access.trialEndsAt)} · Subscribe to keep watching.
        </div>
      </div>
      <Link href="/tv/account/plans" className="ac-btn ac-btn-primary">Subscribe</Link>
    </div>
  );
}

// ─── Cards ──────────────────────────────────────────────────────────────

function AccountCard({ access }: { access: ReturnType<typeof useAccess> }) {
  return (
    <div className="ac-card">
      <div className="ac-card-title">Account</div>
      <dl className="ac-detail">
        <dt>Email</dt>
        <dd>{access.email ?? '—'}</dd>

        <dt>Member since</dt>
        <dd>{formatDate(access.createdAt)}</dd>

        <dt>User ID</dt>
        <dd className="ac-mono">{access.userId ? access.userId.slice(0, 12) + '…' : '—'}</dd>
      </dl>
      <Link href="/tv/account/security" className="ac-btn ac-btn-sm" style={{ marginTop: 14 }}>
        Security &amp; password →
      </Link>
    </div>
  );
}

function SubscriptionCard({ access }: { access: ReturnType<typeof useAccess> }) {
  const planLabel =
    access.status === 'subscribed' ? 'Subscribed' :
    access.status === 'trial'      ? 'Free Trial' :
    access.status === 'expired'    ? 'Expired'    :
                                     '—';
  const planTone =
    access.status === 'subscribed' ? 'ac-stat-ok'   :
    access.status === 'trial'      ? 'ac-stat-info' :
    access.status === 'expired'    ? 'ac-stat-warn' :
                                     '';
  return (
    <div className="ac-card">
      <div className="ac-card-title">Subscription</div>
      <div className={`ac-stat-v ${planTone}`} style={{ fontSize: 26, fontWeight: 800 }}>{planLabel}</div>
      <dl className="ac-detail" style={{ marginTop: 10 }}>
        {access.status === 'trial' && <>
          <dt>Days left</dt>     <dd>{access.daysLeft ?? '—'}</dd>
          <dt>Trial ends</dt>    <dd>{formatDate(access.trialEndsAt)}</dd>
        </>}
        {access.status === 'subscribed' && <>
          <dt>Renews on</dt>     <dd>{formatDate(access.subscribedUntil)}</dd>
        </>}
        {access.status === 'expired' && <>
          <dt>Trial ended</dt>   <dd>{formatDate(access.trialEndsAt)}</dd>
        </>}
      </dl>
      <Link href="/tv/account/plans" className="ac-btn ac-btn-sm" style={{ marginTop: 14 }}>
        {access.status === 'subscribed' ? 'Change plan' : 'See plans'} →
      </Link>
    </div>
  );
}

function ContentCard({
  liveCount, epgCount, vodCount, channelCount, mode,
}: { liveCount: number; epgCount: number; vodCount: number; channelCount: number; mode: 'proxy' | 'direct' }) {
  return (
    <div className="ac-card">
      <div className="ac-card-title">Content</div>
      <dl className="ac-detail">
        <dt>Channels loaded</dt>
        <dd>{channelCount > 0 ? channelCount.toLocaleString() : <span style={{ color: 'var(--ns-text-faint)' }}>none yet</span>}</dd>

        <dt>Live sources</dt>
        <dd>{liveCount}</dd>

        <dt>EPG sources</dt>
        <dd>{epgCount}</dd>

        <dt>VOD libraries</dt>
        <dd>{vodCount}</dd>

        <dt>Streaming mode</dt>
        <dd>
          {mode === 'direct'
            ? <span className="ac-status-pill ac-status-ok" style={{ fontSize: 10 }}>DIRECT</span>
            : <span className="ac-status-pill ac-status-mut" style={{ fontSize: 10 }}>PROXY</span>}
        </dd>
      </dl>
      <Link href="/tv/account/sources" className="ac-btn ac-btn-sm" style={{ marginTop: 14 }}>
        Manage sources →
      </Link>
    </div>
  );
}

// ─── Sources list (no raw URLs) ─────────────────────────────────────────

function SourcesCard({ live, epg, vod }: { live: Source[]; epg: Source[]; vod: Source[] }) {
  const all = [
    ...live.map((s) => ({ ...s, kindLabel: 'M3U' })),
    ...epg.map((s)  => ({ ...s, kindLabel: 'EPG' })),
    ...vod.map((s)  => ({ ...s, kindLabel: 'VOD' })),
  ];

  if (all.length === 0) {
    return (
      <div className="ac-card">
        <div className="ac-card-title">Your content sources</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, margin: 0 }}>
          No sources connected yet. Head to{' '}
          <Link className="ac-auth-link" href="/tv/account/sources">Playlists &amp; EPG</Link>{' '}
          to add an M3U / Xtream provider.
        </p>
      </div>
    );
  }

  return (
    <div className="ac-card">
      <div className="ac-card-title">Your content sources · {all.length}</div>
      {all.map((s) => (
        <div key={`${s.kindLabel}-${s.id}`} className="ac-source">
          <div className="ac-source-icon">{s.kindLabel}</div>
          <div className="ac-source-meta">
            <div className="ac-source-title">{s.title}</div>
            <div className="ac-source-url ac-mono">{maskSourceUrl(s.sub)}</div>
          </div>
          <div className="ac-source-stats"><div>{s.stat}</div></div>
          <Link href="/tv/account/sources" className="ac-btn ac-btn-sm">Manage</Link>
        </div>
      ))}
    </div>
  );
}

// ─── Settings sync status ───────────────────────────────────────────────

function SyncCard({ lastSync }: { lastSync: number | null }) {
  const since = lastSync ? Math.max(0, Math.floor((Date.now() - lastSync) / 1000)) : null;
  const sinceLabel =
    since === null     ? null :
    since < 5          ? 'just now' :
    since < 60         ? `${since}s ago` :
    since < 60 * 60    ? `${Math.floor(since / 60)} min ago` :
    since < 24 * 3600  ? `${Math.floor(since / 3600)} h ago` :
                         formatDateTime(lastSync);
  return (
    <div className="ac-card">
      <div className="ac-card-title">Settings sync</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 }}>
        <span className="ac-status-pill ac-status-ok" style={{ fontSize: 10 }}>ON</span>
        <span>
          {sinceLabel
            ? <>Last synced <b>{sinceLabel}</b>.</>
            : <>Your settings sync to your account automatically whenever you change them.</>}
        </span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--ns-text-faint)', margin: '10px 0 0' }}>
        Stored encrypted at rest in Cloudflare KV. Sign in on any device to restore your playlist, EPG and preferences.
      </p>
    </div>
  );
}

// ─── Quick actions row ─────────────────────────────────────────────────

function QuickActions({ access }: { access: ReturnType<typeof useAccess> }) {
  const trialing = access.status === 'trial' || access.status === 'expired';
  return (
    <div className="ac-quick">
      <div className="ac-card-title" style={{ width: '100%' }}>Quick actions</div>
      <Link href="/tv/account/sources" className="ac-btn">📡  Sources</Link>
      {trialing && <Link href="/tv/account/plans" className="ac-btn ac-btn-primary">✨  Subscribe</Link>}
      <Link href="/tv/account/devices"  className="ac-btn">▣  Devices</Link>
      <Link href="/tv/account/security" className="ac-btn">⚿  Security</Link>
      <Link href="/tv/account/help"     className="ac-btn">?  Help &amp; legal</Link>
      <button className="ac-btn ac-btn-danger" onClick={signOut}>Sign out</button>
    </div>
  );
}
