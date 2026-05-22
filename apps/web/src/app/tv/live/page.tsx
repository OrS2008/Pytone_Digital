'use client';

/*
 * Live TV — the channel-list-first IPTV experience.
 *
 * In production the channel list comes from the playlist-ingestion
 * microservice via gRPC-Web. Until that backend is reachable we fall
 * back to a frontend-only path:
 *
 *   1. Read the user's saved M3U URL from localStorage (written by
 *      /tv/account/sources).
 *   2. Fetch it through /api/m3u (a Netlify edge proxy that adds CORS
 *      and refuses private/loopback hosts).
 *   3. Parse with lib/m3u, hand the channels to the rail and player.
 *
 * If no M3U is saved or the fetch fails we render the mock channel set
 * so the UX is still demonstrable.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import TvNav from '@/components/tv/TvNav';
import { TvFocusProvider } from '@/components/tv/TvFocus';
import ChannelRail from '@/components/tv/live/ChannelRail';
import PlayerSurface from '@/components/tv/live/PlayerSurface';
import InfoBar from '@/components/tv/live/InfoBar';
import NumberZap from '@/components/tv/live/NumberZap';
import { MOCK_CHANNELS } from '@/components/tv/live/mockChannels';
import type { Channel } from '@/components/tv/live/types';
import { parseM3U } from '@/lib/m3u';
import './live.css';

interface StoredSource { id: string; kind: string; title: string; sub: string; stat: string; }

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; count: number; sourceTitle: string }
  | { kind: 'mock' }
  | { kind: 'error'; message: string };

export default function LivePage() {
  const [channels, setChannels] = useState<Channel[]>(MOCK_CHANNELS);
  const [activeIdx, setActiveIdx] = useState(0);
  const [infoVisible, setInfoVisible] = useState(true);
  const [load, setLoad] = useState<LoadState>({ kind: 'idle' });

  const active = channels[activeIdx];

  // On mount: look for a saved live-source and load it.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      let stored: StoredSource[] = [];
      try {
        const raw = localStorage.getItem('ns.sources.live');
        if (raw) stored = JSON.parse(raw) as StoredSource[];
      } catch { /* corrupt storage */ }

      // Only treat URLs the user typed themselves (not the seeded example).
      const userSource = stored.find((s) =>
        s.id !== 'live-1' &&
        typeof s.sub === 'string' &&
        (s.sub.startsWith('http://') || s.sub.startsWith('https://')),
      );
      if (!userSource) { setLoad({ kind: 'mock' }); return; }

      setLoad({ kind: 'loading' });
      try {
        const resp = await fetch('/api/m3u?url=' + encodeURIComponent(userSource.sub));
        if (!resp.ok) {
          const body = await resp.text();
          throw new Error(`HTTP ${resp.status} — ${body || resp.statusText}`);
        }
        const text = await resp.text();
        const parsed = parseM3U(text);
        if (parsed.length === 0) {
          throw new Error('No channels found in playlist. Check the URL.');
        }
        if (cancelled) return;
        setChannels(parsed);
        setActiveIdx(0);
        setLoad({ kind: 'ready', count: parsed.length, sourceTitle: userSource.title });
      } catch (e) {
        if (cancelled) return;
        setLoad({ kind: 'error', message: (e as Error).message });
      }
    }
    run();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!infoVisible) return;
    const t = setTimeout(() => setInfoVisible(false), 5000);
    return () => clearTimeout(t);
  }, [infoVisible, activeIdx]);

  const tune = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= channels.length) return;
      setActiveIdx(idx);
      setInfoVisible(true);
    },
    [channels.length],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'PageUp')   tune(activeIdx - 1);
      if (e.key === 'PageDown') tune(activeIdx + 1);
      if (e.key === 'i' || e.key === 'Info') setInfoVisible((v) => !v);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIdx, tune]);

  const tuneByNumber = useCallback(
    (num: number) => {
      const i = channels.findIndex((c) => c.number === num);
      if (i >= 0) tune(i);
    },
    [channels, tune],
  );

  const layout = useMemo(() => 'live-layout', []);
  return (
    <TvFocusProvider>
      <div className={layout}>
        <TvNav />

        {load.kind === 'loading' && (
          <div className="live-status">Loading your playlist…</div>
        )}
        {load.kind === 'ready' && (
          <div className="live-status live-status-ok">
            {load.sourceTitle} · {load.count} channels loaded.
          </div>
        )}
        {load.kind === 'mock' && (
          <div className="live-status">
            Showing demo channels.{' '}
            <Link href="/tv/account/sources" className="live-status-link">
              Add your M3U →
            </Link>
          </div>
        )}
        {load.kind === 'error' && (
          <div className="live-status live-status-err">
            Could not load your playlist: {load.message}.{' '}
            <Link href="/tv/account/sources" className="live-status-link">
              Edit the URL →
            </Link>
          </div>
        )}

        <div className="live-body">
          <ChannelRail
            channels={channels}
            activeIdx={activeIdx}
            onTune={tune}
          />
          <PlayerSurface channel={active} />
        </div>
        <InfoBar
          channel={active}
          visible={infoVisible}
          onDismiss={() => setInfoVisible(false)}
          onTune={tune}
          activeIdx={activeIdx}
          channels={channels}
        />
        <NumberZap onCommit={tuneByNumber} />
      </div>
    </TvFocusProvider>
  );
}
