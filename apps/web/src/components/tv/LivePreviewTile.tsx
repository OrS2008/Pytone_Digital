'use client';

/*
 * LivePreviewTile
 *
 * A clickable tile that shows a muted, live, low-latency preview of an
 * IPTV channel. Used by the home-page rows and the hero so the user
 * actually sees moving pictures from their playlist, not just logos.
 *
 * Performance contract:
 *   - Only tiles in the viewport ever attach to <video>; off-screen
 *     tiles render the static logo and nothing more.
 *   - We cap the total number of simultaneously-decoding tiles at
 *     MAX_CONCURRENT so a long scroll doesn't open 30 HLS sessions
 *     in parallel. When the cap is reached new candidates wait their
 *     turn (eviction is FIFO).
 *   - hls.js is dynamically imported on first need so the entry
 *     bundle stays lean.
 *
 * Failure model:
 *   - CORS, captive portals, slow networks, codec mismatches all
 *     resolve to the same outcome: render the channel logo and the
 *     LIVE chip. We never show a broken-image placeholder.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { M3UChannel } from '@/lib/m3u';
import { proxiedStreamUrl } from '@/lib/streamProxy';

interface Props {
  channel: M3UChannel;
  /** Force-disable the live preview and show the logo only. */
  staticOnly?: boolean;
  /** Tailwind/CSS className applied to the outer Link. */
  className?: string;
}

interface HlsInstance {
  loadSource: (u: string) => void;
  attachMedia: (v: HTMLVideoElement) => void;
  on: (e: string, cb: (...a: unknown[]) => void) => void;
  destroy: () => void;
}
interface HlsCtor {
  new (cfg?: unknown): HlsInstance;
  isSupported: () => boolean;
  Events: { ERROR: string; MANIFEST_PARSED: string };
}

// Global cap on concurrently-attached HLS sessions. The number is
// empirical — six 540p HLS streams behave on a typical laptop; more
// than that and even Chrome's decoder pool starts dropping frames.
const MAX_CONCURRENT = 6;
const ACTIVE: Set<symbol> = new Set();
const WAITING: Array<() => void> = [];

function acquireSlot(): Promise<symbol> {
  const token = Symbol('preview');
  return new Promise((resolve) => {
    const grant = () => { ACTIVE.add(token); resolve(token); };
    if (ACTIVE.size < MAX_CONCURRENT) grant();
    else WAITING.push(grant);
  });
}
function releaseSlot(token: symbol) {
  ACTIVE.delete(token);
  const next = WAITING.shift();
  if (next) next();
}

let hlsModulePromise: Promise<HlsCtor> | null = null;
async function loadHls(): Promise<HlsCtor> {
  if (!hlsModulePromise) {
    hlsModulePromise = import('hls.js').then((m) => (m as unknown as { default: HlsCtor }).default);
  }
  return hlsModulePromise;
}

export default function LivePreviewTile({ channel, staticOnly, className }: Props) {
  const rootRef  = useRef<HTMLAnchorElement | null>(null);
  const videoRef = useRef<HTMLVideoElement  | null>(null);
  const [visible,    setVisible]    = useState(false);
  const [playing,    setPlaying]    = useState(false);
  const [failed,     setFailed]     = useState(false);

  // Visibility — IntersectionObserver. Only viewport tiles try to
  // play; everything else stays cheap.
  useEffect(() => {
    if (staticOnly || !rootRef.current) return;
    const el = rootRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setVisible(e.isIntersecting);
      },
      { rootMargin: '120px 0px', threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [staticOnly]);

  // Stream lifecycle — acquires a global slot, attaches hls.js (or
  // native HLS on Safari/iOS), aborts cleanly on any failure path.
  useEffect(() => {
    if (!visible || failed || staticOnly) return;
    const video = videoRef.current;
    if (!video || !channel.streamUrl) return;

    let cancelled = false;
    let hls: HlsInstance | null = null;
    let slot: symbol | null = null;

    (async () => {
      slot = await acquireSlot();
      if (cancelled) { releaseSlot(slot); return; }

      video.muted = true;
      video.playsInline = true;

      // Route the stream through our same-origin proxy so segment /
      // manifest fetches don't get CORS-blocked. The proxy rewrites
      // URLs inside the manifest, so once the first hop is wrapped
      // hls.js stays on the proxied origin the rest of the way.
      const streamUrl = proxiedStreamUrl(channel.streamUrl);
      const isHls    = /\.m3u8(\?|$)/i.test(channel.streamUrl);
      const canNative = video.canPlayType('application/vnd.apple.mpegurl') !== '';

      const onFatal = () => {
        if (cancelled) return;
        setFailed(true);
        setPlaying(false);
      };

      try {
        if (isHls && !canNative) {
          const Hls = await loadHls();
          if (cancelled || !Hls.isSupported()) { onFatal(); return; }
          hls = new Hls({ liveSyncDuration: 3, lowLatencyMode: true, maxBufferLength: 6 });
          hls.attachMedia(video);
          hls.loadSource(streamUrl);
          hls.on(Hls.Events.ERROR, onFatal);
        } else {
          video.src = streamUrl;
        }

        await video.play().catch(onFatal);
        if (!cancelled) setPlaying(true);
      } catch {
        onFatal();
      }
    })();

    return () => {
      cancelled = true;
      try { video.pause(); video.removeAttribute('src'); video.load(); } catch { /* ignore */ }
      if (hls) { try { hls.destroy(); } catch { /* ignore */ } }
      if (slot) releaseSlot(slot);
      setPlaying(false);
    };
  }, [visible, failed, staticOnly, channel.streamUrl]);

  const showLogo = !playing || failed;
  const onError  = useCallback(() => setFailed(true), []);

  return (
    <Link
      ref={rootRef}
      href={`/tv/live?ch=${encodeURIComponent(String(channel.number))}`}
      className={`tv-tile ${className || ''}`}
    >
      {!staticOnly && !failed && (
        <video
          ref={videoRef}
          muted
          playsInline
          preload="none"
          aria-hidden
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover',
            opacity: playing ? 1 : 0,
            transition: 'opacity 320ms ease',
            background: '#0E1218',
            pointerEvents: 'none',
          }}
          onError={onError}
        />
      )}
      {showLogo && (
        channel.logoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img
              src={channel.logoUrl}
              alt=""
              loading="lazy"
              onError={onError}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'contain', padding: 24, background: '#0E1218',
              }}
            />
          : <div className="tv-tile-num">{channel.number}</div>
      )}
      <div className="tv-tile-gradient" />
      <div className="tv-tile-caption">
        <div style={{ fontWeight: 700 }}>{channel.name}</div>
        <div style={{ fontSize: 12, color: '#B7BEC9', fontWeight: 500, marginTop: 2 }}>
          #{channel.number} · {channel.category}
        </div>
      </div>
      <div style={{
        position: 'absolute', top: 10, left: 10,
        padding: '3px 8px', borderRadius: 4,
        background: playing ? '#FF3B6E' : 'rgba(255,59,110,0.55)',
        color: '#fff',
        fontSize: 10, fontWeight: 800, letterSpacing: 1,
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {playing && (
          <span style={{
            width: 6, height: 6, borderRadius: 3, background: '#fff',
            animation: 'tv-tile-blink 1.4s steps(2) infinite',
          }} />
        )}
        LIVE
      </div>
    </Link>
  );
}
