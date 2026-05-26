'use client';

/*
 * LivePreviewTile
 *
 * Default UX:
 *   1. Render the channel logo (cheap, instant, always works).
 *   2. Once the tile is in the viewport, periodically capture a still
 *      frame from the live stream and overlay it. The image updates
 *      every ~10s so the row feels alive without ever running 12 video
 *      decoders at once.
 *   3. When the user hovers / focuses the tile (mouse, keyboard, or
 *      TV-remote arrow over the tile), tear the snapshot down and play
 *      the stream live for as long as the pointer stays on it.
 *
 * Why snapshots over always-playing previews:
 *   The previous build attached every visible tile to <video> at the
 *   same time. On a desktop with 12-16 tiles in a row that's a guaranteed
 *   frame-drop and decoder eviction storm; on a 4K TV browser it crashes
 *   the page. Pulling one frame, painting it to a canvas, and tearing
 *   the video element down again keeps the long-running decoder count
 *   at 0 when nothing is hovered.
 *
 * Failure model:
 *   CORS, captive portals, codec mismatches, snapshot canvas errors —
 *   they all degrade to the channel logo + LIVE chip. We never show a
 *   broken-image placeholder or an error toast inside a tile.
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
  Events: { ERROR: string; MANIFEST_PARSED: string; FRAG_LOADED: string };
}

// Hard cap on concurrently-playing tile streams (hover sessions only —
// snapshots release their slot the moment the frame is captured). On
// most laptops 4 hovered tiles is already aggressive; we keep it tight
// because tiles don't compete with the main player or with the home
// hero, both of which want their own decoder slot.
const MAX_CONCURRENT = 4;
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

// Stagger snapshot refreshes so a row of 12 tiles doesn't burst all at
// once. Each tile picks its own interval slot at mount and refreshes
// roughly every SNAPSHOT_INTERVAL_MS, but its first capture is jittered
// inside the window so adjacent tiles don't synchronize.
const SNAPSHOT_INTERVAL_MS = 10_000;
const SNAPSHOT_JITTER_MS   = 6_000;

export default function LivePreviewTile({ channel, staticOnly, className }: Props) {
  const rootRef     = useRef<HTMLAnchorElement | null>(null);
  const hoverVideoRef = useRef<HTMLVideoElement | null>(null);
  const [visible,  setVisible]  = useState(false);
  const [hovered,  setHovered]  = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [livePlaying, setLivePlaying] = useState(false);
  const [failed,   setFailed]   = useState(false);
  // Object URLs we created via canvas.toBlob — we revoke them on
  // replacement so the page doesn't leak megabytes of decoded frames.
  const prevSnapshotRef = useRef<string | null>(null);

  // Visibility — IntersectionObserver. Tiles below the fold never bother
  // grabbing snapshots until they scroll in.
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

  // Snapshot capture loop — only while the tile is in the viewport,
  // hasn't permanently failed, and isn't actively hovered (the hover
  // path runs its own continuous playback on a different <video>).
  useEffect(() => {
    if (staticOnly || failed) return;
    if (!visible) return;
    if (hovered) return;
    if (!channel.streamUrl) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const captureOnce = async (): Promise<void> => {
      if (cancelled) return;
      const slot = await acquireSlot();
      if (cancelled) { releaseSlot(slot); return; }

      // Build an off-DOM <video> just for the capture. Mounting it
      // outside React lets us tear it down deterministically without
      // races with the hover-video element.
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      // Keep it visually invisible but in the layout tree so iOS Safari
      // actually decodes a frame (background videos sometimes don't).
      video.style.cssText = 'position:fixed;left:-10000px;top:0;width:160px;height:90px;pointer-events:none;';
      document.body.appendChild(video);

      let hls: HlsInstance | null = null;
      const cleanup = () => {
        try { video.pause(); video.removeAttribute('src'); video.load(); } catch { /* ignore */ }
        if (hls) { try { hls.destroy(); } catch { /* ignore */ } }
        if (video.parentNode) video.parentNode.removeChild(video);
        releaseSlot(slot);
      };

      // Bound the whole capture attempt so a frozen / slow stream
      // doesn't hold our concurrency slot forever.
      const watchdog = setTimeout(() => {
        if (cancelled) return;
        cleanup();
      }, 8_000);

      try {
        const streamUrl = proxiedStreamUrl(channel.streamUrl);
        const isHls    = /\.m3u8(\?|$)/i.test(channel.streamUrl);
        const canNative = video.canPlayType('application/vnd.apple.mpegurl') !== '';

        const onFirstFrame = () => {
          if (cancelled) return;
          // Defer one rAF so the video element has actually painted
          // something — `loadeddata` fires a touch early on some
          // browsers and you get a black frame otherwise.
          requestAnimationFrame(() => {
            try {
              if (cancelled) return;
              const w = Math.max(160, Math.min(video.videoWidth || 320, 480));
              const h = Math.max(90,  Math.min(video.videoHeight || 180, 270));
              const canvas = document.createElement('canvas');
              canvas.width = w; canvas.height = h;
              const ctx = canvas.getContext('2d');
              if (!ctx) { clearTimeout(watchdog); cleanup(); return; }
              ctx.drawImage(video, 0, 0, w, h);
              canvas.toBlob((blob) => {
                clearTimeout(watchdog);
                cleanup();
                if (cancelled || !blob) return;
                const url = URL.createObjectURL(blob);
                if (prevSnapshotRef.current) {
                  try { URL.revokeObjectURL(prevSnapshotRef.current); } catch { /* ignore */ }
                }
                prevSnapshotRef.current = url;
                setSnapshot(url);
              }, 'image/jpeg', 0.78);
            } catch {
              clearTimeout(watchdog);
              cleanup();
            }
          });
        };

        video.addEventListener('loadeddata', onFirstFrame, { once: true });

        if (isHls && !canNative) {
          const Hls = await loadHls();
          if (cancelled || !Hls.isSupported()) { clearTimeout(watchdog); cleanup(); return; }
          hls = new Hls({ liveSyncDuration: 3, lowLatencyMode: false, maxBufferLength: 4 });
          hls.attachMedia(video);
          hls.loadSource(streamUrl);
          hls.on(Hls.Events.ERROR, () => { clearTimeout(watchdog); cleanup(); });
        } else {
          video.src = streamUrl;
        }
        await video.play().catch(() => { clearTimeout(watchdog); cleanup(); });
      } catch {
        clearTimeout(watchdog);
        cleanup();
      }
    };

    // First capture is delayed by a random fraction of the interval so
    // a row of 12 tiles doesn't fire 12 simultaneous fetches the moment
    // it scrolls into view.
    const firstDelay = Math.random() * SNAPSHOT_JITTER_MS;
    timer = setTimeout(function run() {
      captureOnce();
      timer = setTimeout(run, SNAPSHOT_INTERVAL_MS);
    }, firstDelay);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [visible, hovered, failed, staticOnly, channel.streamUrl]);

  // Hover playback — separate <video> in the DOM so it owns its own
  // decoder lifecycle and tears down cleanly when the pointer leaves.
  useEffect(() => {
    if (!hovered || staticOnly || failed) return;
    const video = hoverVideoRef.current;
    if (!video || !channel.streamUrl) return;

    let cancelled = false;
    let hls: HlsInstance | null = null;
    let slot: symbol | null = null;

    (async () => {
      slot = await acquireSlot();
      if (cancelled || !hovered) { releaseSlot(slot); return; }

      video.muted = true;
      video.playsInline = true;

      const streamUrl = proxiedStreamUrl(channel.streamUrl);
      const isHls    = /\.m3u8(\?|$)/i.test(channel.streamUrl);
      const canNative = video.canPlayType('application/vnd.apple.mpegurl') !== '';

      const onFatal = () => {
        if (cancelled) return;
        setFailed(true);
        setLivePlaying(false);
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
        if (!cancelled) setLivePlaying(true);
      } catch {
        onFatal();
      }
    })();

    return () => {
      cancelled = true;
      try { video.pause(); video.removeAttribute('src'); video.load(); } catch { /* ignore */ }
      if (hls) { try { hls.destroy(); } catch { /* ignore */ } }
      if (slot) releaseSlot(slot);
      setLivePlaying(false);
    };
  }, [hovered, failed, staticOnly, channel.streamUrl]);

  // Release the final snapshot blob on unmount.
  useEffect(() => () => {
    if (prevSnapshotRef.current) {
      try { URL.revokeObjectURL(prevSnapshotRef.current); } catch { /* ignore */ }
      prevSnapshotRef.current = null;
    }
  }, []);

  const onError = useCallback(() => setFailed(true), []);
  const onEnter = useCallback(() => setHovered(true),  []);
  const onLeave = useCallback(() => setHovered(false), []);

  // Layering order, bottom → top:
  //   1. logo / number (always rendered, hidden behind snapshot/live)
  //   2. snapshot <img> (when we have one and we're not playing live)
  //   3. hover <video>  (when hovered + playing)
  // Each upper layer is rendered with opacity so the transition is a
  // gentle fade rather than a hard pop.
  const showSnapshot = !!snapshot && !livePlaying && !failed;
  const showLive     = hovered && !failed;

  return (
    <Link
      ref={rootRef}
      href={`/tv/live?ch=${encodeURIComponent(String(channel.number))}`}
      className={`tv-tile ${className || ''}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
    >
      {/* Layer 1: logo / number — always there, peeks through during loads. */}
      {channel.logoUrl
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
        : <div className="tv-tile-num">{channel.number}</div>}

      {/* Layer 2: snapshot. */}
      {showSnapshot && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={snapshot!}
          alt=""
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover',
            opacity: showLive ? 0 : 1,
            transition: 'opacity 320ms ease',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Layer 3: live hover video. */}
      {!staticOnly && (
        <video
          ref={hoverVideoRef}
          muted
          playsInline
          preload="none"
          aria-hidden
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover',
            opacity: showLive && livePlaying ? 1 : 0,
            transition: 'opacity 240ms ease',
            background: '#0E1218',
            pointerEvents: 'none',
          }}
        />
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
        background: showLive && livePlaying ? '#FF3B6E' : 'rgba(255,59,110,0.55)',
        color: '#fff',
        fontSize: 10, fontWeight: 800, letterSpacing: 1,
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {showLive && livePlaying && (
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
