'use client';

import { useEffect, useRef, useState } from 'react';
import type { Channel } from './types';

/*
 * The player surface.
 *
 * Autoplay reality:
 *   Every modern browser blocks autoplay-with-sound unless the user
 *   has interacted with the document very recently. We side-step that
 *   by starting muted (always allowed) and surfacing a one-click
 *   "Tap to unmute" overlay. As soon as the user clicks anywhere in
 *   the player, audio comes on.
 *
 * Streaming:
 *   - Safari / iOS / many smart TVs play HLS natively → just set src.
 *   - Everywhere else, hls.js is lazy-imported and feeds MSE.
 *
 * Errors are surfaced as a card with the channel + the reason (geo
 * block, auth, CORS on segments, etc.) so the user understands why a
 * given channel isn't playing.
 */
interface Props {
  channel?: Channel;
  autoPlay?: boolean;
}

export default function PlayerSurface({ channel, autoPlay = true }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !channel?.streamUrl) {
      setErr(null);
      setPlaying(false);
      return;
    }
    setErr(null);
    setPlaying(false);
    let hls: { destroy: () => void } | null = null;
    let cancelled = false;

    const isHls = /\.m3u8(\?|$)/i.test(channel.streamUrl);
    const canNative = video.canPlayType('application/vnd.apple.mpegurl') !== '';

    async function attach() {
      if (!video) return;
      // Muted is required for reliable autoplay across browsers.
      video.muted = true;
      if (isHls && !canNative) {
        try {
          const mod = (await import('hls.js')) as unknown as { default: unknown };
          if (cancelled) return;
          const Hls = mod.default as unknown as {
            new (cfg?: unknown): {
              loadSource: (u: string) => void;
              attachMedia: (v: HTMLVideoElement) => void;
              on: (e: string, cb: (...a: unknown[]) => void) => void;
              destroy: () => void;
            };
            isSupported: () => boolean;
            Events: { ERROR: string; MANIFEST_PARSED: string };
          };
          if (!Hls.isSupported()) {
            setErr('Your browser does not support HLS playback.');
            return;
          }
          const h = new Hls({ enableWorker: true, lowLatencyMode: true });
          hls = h;
          h.on(Hls.Events.ERROR, (...args: unknown[]) => {
            const data = args[1] as { fatal?: boolean; details?: string } | undefined;
            if (data?.fatal) setErr(`Stream error: ${data.details ?? 'fatal'}`);
          });
          h.on(Hls.Events.MANIFEST_PARSED, () => {
            if (autoPlay) video.play().catch(() => {/* user gesture required */});
          });
          h.loadSource(channel!.streamUrl!);
          h.attachMedia(video);
        } catch (e) {
          setErr(`HLS init failed: ${(e as Error).message}`);
        }
      } else {
        video.src = channel!.streamUrl!;
        if (autoPlay) video.play().catch(() => {/* user gesture required */});
      }
    }
    attach();

    return () => {
      cancelled = true;
      if (hls) hls.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [channel?.streamUrl, autoPlay]);

  // Click anywhere on the surface to unmute. We deliberately don't
  // toggle pause on click — the native <video controls> is below and
  // already has a pause button.
  function unmute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.volume = 1;
    setMuted(false);
    v.play().catch(() => {/* ignore */});
  }

  return (
    <div className="player-surface" onClick={muted ? unmute : undefined}>
      {channel?.streamUrl ? (
        <>
          <video
            ref={videoRef}
            autoPlay={autoPlay}
            playsInline
            muted
            controls
            style={{ width: '100%', height: '100%', background: '#000', objectFit: 'contain' }}
            onPlaying={() => setPlaying(true)}
            onWaiting={() => setPlaying(false)}
          />
          {!playing && !err && (
            <div className="player-loading">Tuning {channel.number} · {channel.name}…</div>
          )}
          {playing && muted && (
            <div className="player-unmute">
              <span>🔇</span>
              <span>Tap to unmute</span>
            </div>
          )}
          {err && (
            <div className="player-error">
              <div className="player-error-title">Can&apos;t play {channel.name}</div>
              <div className="player-error-msg">{err}</div>
              <div className="player-error-hint">
                The stream URL may be geo-blocked, require credentials, or block cross-origin playback.
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="placeholder" />
          <div className="placeholder-meta">
            {channel && (
              <>
                <div className="ch-num">{channel.number}</div>
                <div style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginTop: 12 }}>
                  {channel.name}
                </div>
                <div style={{ marginTop: 6 }}>{channel.now?.title ?? 'No programme info'}</div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
