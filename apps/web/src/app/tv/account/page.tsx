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
import { useT, getLocale } from '@/lib/i18n';
import { maskSourceUrl } from '@/lib/maskUrl';

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
    // Tolerate both JSON-encoded values (usePersisted's normal output)
    // and raw strings (Toggle / SubtitleControls / legacy server-sync
    // writes). Same logic lives in lib/usePersisted's lenientParse.
    try { return JSON.parse(raw) as T; }
    catch { return raw as unknown as T; }
  } catch { return fallback; }
}

// Dates follow the interface language (client-only values, so reading
// the saved locale here is hydration-safe).
function dateLocale(): string { return getLocale() === 'he' ? 'he-IL' : 'en-GB'; }

function formatDate(ms: number | undefined | null): string {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleDateString(dateLocale(), { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatDateTime(ms: number | undefined | null): string {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleDateString(dateLocale(), { day: '2-digit', month: 'short', year: 'numeric' }) +
         ' · ' + d.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });
}

export default function AccountOverview() {
  const { t } = useT();
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
        <div className="ac-panel-eyebrow">{t('acc.eyebrow')}</div>
        <h1 className="ac-panel-title">
          {access.status === 'loading' ? t('acc.loading') : displayName ? `${t('acc.hi')} ${displayName}` : t('acc.eyebrow')}
        </h1>
        <p className="ac-panel-sub">
          {t('acc.sub')}
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
  const { t } = useT();
  if (access.status === 'loading') {
    return <div className="ac-banner ac-banner-loading">{t('acc.loadingAccount')}</div>;
  }
  if (access.status === 'anon') {
    return null; // AccountGate already shows the sign-in wall.
  }
  if (access.status === 'error') {
    return (
      <div className="ac-banner ac-banner-warn">
        <div>
          <div className="ac-banner-h">{t('acc.unreach')}</div>
          <div className="ac-banner-sub">{t('acc.unreachSub')}</div>
        </div>
      </div>
    );
  }
  if (access.status === 'subscribed') {
    return (
      <div className="ac-banner ac-banner-ok">
        <div>
          <span className="ac-status-pill ac-status-ok">{t('acc.pillSubscribed')}</span>
          <div className="ac-banner-h" style={{ marginTop: 8 }}>{t('acc.allSet')}</div>
          <div className="ac-banner-sub">
            {t('acc.renewsOn')} {formatDate(access.subscribedUntil)} · {t('acc.cancelAny')}
          </div>
        </div>
        <Link href="/tv/account/subscription" className="ac-btn">{t('acc.manageSub')}</Link>
      </div>
    );
  }
  if (access.status === 'trial') {
    const days = access.daysLeft ?? 0;
    return (
      <div className="ac-banner ac-banner-info">
        <div>
          <span className="ac-status-pill ac-status-trial">{t('acc.pillTrial')} · {days}{t('acc.dLeft')}</span>
          <div className="ac-banner-h" style={{ marginTop: 8 }}>
            {days <= 1 ? t('acc.trialSoon') : `${days} ${t('acc.daysRemaining')}`}
          </div>
          <div className="ac-banner-sub">
            {t('acc.trialEndsOn')} {formatDate(access.trialEndsAt)} · {t('acc.subscribeBefore')}
          </div>
        </div>
        <Link href="/tv/account/plans" className="ac-btn ac-btn-primary">{t('acc.subscribe')}</Link>
      </div>
    );
  }
  // expired
  return (
    <div className="ac-banner ac-banner-warn">
      <div>
        <span className="ac-status-pill ac-status-warn">{t('acc.pillExpired')}</span>
        <div className="ac-banner-h" style={{ marginTop: 8 }}>{t('acc.trialEnded')}</div>
        <div className="ac-banner-sub">
          {t('acc.trialEndedOn')} {formatDate(access.trialEndsAt)} · {t('acc.subscribeKeep')}
        </div>
      </div>
      <Link href="/tv/account/plans" className="ac-btn ac-btn-primary">{t('acc.subscribe')}</Link>
    </div>
  );
}

// ─── Cards ──────────────────────────────────────────────────────────────

function AccountCard({ access }: { access: ReturnType<typeof useAccess> }) {
  const { t } = useT();
  return (
    <div className="ac-card">
      <div className="ac-card-title">{t('acc.eyebrow')}</div>
      <dl className="ac-detail">
        <dt>{t('acc.email')}</dt>
        <dd>{access.email ?? '—'}</dd>

        <dt>{t('acc.memberSince')}</dt>
        <dd>{formatDate(access.createdAt)}</dd>

        <dt>{t('acc.userId')}</dt>
        <dd className="ac-mono" dir="ltr">{access.userId ? access.userId.slice(0, 12) + '…' : '—'}</dd>
      </dl>
      <Link href="/tv/account/security" className="ac-btn ac-btn-sm" style={{ marginTop: 14 }}>
        {t('acc.securityLink')} {t('acc.arrow')}
      </Link>
    </div>
  );
}

function SubscriptionCard({ access }: { access: ReturnType<typeof useAccess> }) {
  const { t } = useT();
  const planLabel =
    access.status === 'subscribed' ? t('acc.planSubscribed') :
    access.status === 'trial'      ? t('acc.planTrial') :
    access.status === 'expired'    ? t('acc.planExpired') :
                                     '—';
  const planTone =
    access.status === 'subscribed' ? 'ac-stat-ok'   :
    access.status === 'trial'      ? 'ac-stat-info' :
    access.status === 'expired'    ? 'ac-stat-warn' :
                                     '';
  return (
    <div className="ac-card">
      <div className="ac-card-title">{t('acc.subscription')}</div>
      <div className={`ac-stat-v ${planTone}`} style={{ fontSize: 26, fontWeight: 800 }}>{planLabel}</div>
      <dl className="ac-detail" style={{ marginTop: 10 }}>
        {access.status === 'trial' && <>
          <dt>{t('acc.daysLeft')}</dt>     <dd>{access.daysLeft ?? '—'}</dd>
          <dt>{t('acc.trialEnds')}</dt>    <dd>{formatDate(access.trialEndsAt)}</dd>
        </>}
        {access.status === 'subscribed' && <>
          <dt>{t('acc.renewsOn')}</dt>     <dd>{formatDate(access.subscribedUntil)}</dd>
        </>}
        {access.status === 'expired' && <>
          <dt>{t('acc.trialEndedShort')}</dt>   <dd>{formatDate(access.trialEndsAt)}</dd>
        </>}
      </dl>
      <Link href="/tv/account/plans" className="ac-btn ac-btn-sm" style={{ marginTop: 14 }}>
        {access.status === 'subscribed' ? t('acc.changePlan') : t('acc.seePlans')} {t('acc.arrow')}
      </Link>
    </div>
  );
}

function ContentCard({
  liveCount, epgCount, vodCount, channelCount, mode,
}: { liveCount: number; epgCount: number; vodCount: number; channelCount: number; mode: 'proxy' | 'direct' }) {
  const { t } = useT();
  return (
    <div className="ac-card">
      <div className="ac-card-title">{t('acc.content')}</div>
      <dl className="ac-detail">
        <dt>{t('acc.channelsLoaded')}</dt>
        <dd>{channelCount > 0 ? channelCount.toLocaleString() : <span style={{ color: 'var(--ns-text-faint)' }}>{t('acc.noneYet')}</span>}</dd>

        <dt>{t('acc.liveSources')}</dt>
        <dd>{liveCount}</dd>

        <dt>{t('acc.epgSources')}</dt>
        <dd>{epgCount}</dd>

        <dt>{t('acc.vodLibs')}</dt>
        <dd>{vodCount}</dd>

        <dt>{t('acc.streamMode')}</dt>
        <dd>
          {mode === 'direct'
            ? <span className="ac-status-pill ac-status-ok" style={{ fontSize: 10 }}>{t('acc.direct')}</span>
            : <span className="ac-status-pill ac-status-mut" style={{ fontSize: 10 }}>{t('acc.proxy')}</span>}
        </dd>
      </dl>
      <Link href="/tv/account/sources" className="ac-btn ac-btn-sm" style={{ marginTop: 14 }}>
        {t('acc.manageSources')} {t('acc.arrow')}
      </Link>
    </div>
  );
}

// ─── Sources list (no raw URLs) ─────────────────────────────────────────

function SourcesCard({ live, epg, vod }: { live: Source[]; epg: Source[]; vod: Source[] }) {
  const { t } = useT();
  const all = [
    ...live.map((s) => ({ ...s, kindLabel: 'M3U' })),
    ...epg.map((s)  => ({ ...s, kindLabel: 'EPG' })),
    ...vod.map((s)  => ({ ...s, kindLabel: 'VOD' })),
  ];

  if (all.length === 0) {
    return (
      <div className="ac-card">
        <div className="ac-card-title">{t('acc.yourSources')}</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, margin: 0 }}>
          {t('acc.noSources1')}{' '}
          <Link className="ac-auth-link" href="/tv/account/sources">{t('acc.playlistsEpg')}</Link>{' '}
          {t('acc.noSources2')}
        </p>
      </div>
    );
  }

  return (
    <div className="ac-card">
      <div className="ac-card-title">{t('acc.yourSources')} · {all.length}</div>
      {all.map((s) => (
        <div key={`${s.kindLabel}-${s.id}`} className="ac-source">
          <div className="ac-source-icon">{s.kindLabel}</div>
          <div className="ac-source-meta">
            <div className="ac-source-title">{s.title}</div>
            <div className="ac-source-url ac-mono" dir="ltr">{maskSourceUrl(s.sub)}</div>
          </div>
          <div className="ac-source-stats"><div>{s.stat}</div></div>
          <Link href="/tv/account/sources" className="ac-btn ac-btn-sm">{t('acc.manage')}</Link>
        </div>
      ))}
    </div>
  );
}

// ─── Settings sync status ───────────────────────────────────────────────

function SyncCard({ lastSync }: { lastSync: number | null }) {
  const { t } = useT();
  const since = lastSync ? Math.max(0, Math.floor((Date.now() - lastSync) / 1000)) : null;
  const sinceLabel =
    since === null     ? null :
    since < 5          ? t('acc.justNow') :
    since < 60         ? `${since}${t('acc.sAgo')}` :
    since < 60 * 60    ? `${Math.floor(since / 60)} ${t('acc.minAgo').trim()}` :
    since < 24 * 3600  ? `${Math.floor(since / 3600)} ${t('acc.hAgo').trim()}` :
                         formatDateTime(lastSync);
  return (
    <div className="ac-card">
      <div className="ac-card-title">{t('acc.sync')}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 }}>
        <span className="ac-status-pill ac-status-ok" style={{ fontSize: 10 }}>{t('acc.on')}</span>
        <span>
          {sinceLabel
            ? <>{t('acc.lastSynced')} <b>{sinceLabel}</b>.</>
            : <>{t('acc.syncAuto')}</>}
        </span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--ns-text-faint)', margin: '10px 0 0' }}>
        {t('acc.syncNote')}
      </p>
    </div>
  );
}

// ─── Quick actions row ─────────────────────────────────────────────────

function QuickActions({ access }: { access: ReturnType<typeof useAccess> }) {
  const { t } = useT();
  const trialing = access.status === 'trial' || access.status === 'expired';
  return (
    <div className="ac-quick">
      <div className="ac-card-title" style={{ width: '100%' }}>{t('acc.quick')}</div>
      <Link href="/tv/account/sources" className="ac-btn">📡  {t('acc.sources')}</Link>
      {trialing && <Link href="/tv/account/plans" className="ac-btn ac-btn-primary">✨  {t('acc.subscribe')}</Link>}
      <Link href="/tv/account/devices"  className="ac-btn">▣  {t('acc.devices')}</Link>
      <Link href="/tv/account/security" className="ac-btn">⚿  {t('acc.security')}</Link>
      <Link href="/tv/account/help"     className="ac-btn">?  {t('acc.help')}</Link>
      <button className="ac-btn ac-btn-danger" onClick={signOut}>{t('auth.signOut')}</button>
    </div>
  );
}
