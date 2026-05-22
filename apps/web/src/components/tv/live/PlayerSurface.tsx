'use client';

import { useEffect, useRef, useState } from 'react';
import type { Channel } from './types';

/*
 * The player surface.
 *
 * In production the URL we attach to <video> is a one-time playback
 * ticket from /api/playback/ticket. Until the playback service is up,
 * we attach the channel's M3U stream URL directly:
 *
 *   - Safari / iOS support HLS natively → just set the src.
 *   - Everywhere else we lazy-load hls.js and feed segments to MSE.
 *
 * On failure we render a clear message and a placeholder card so the
 * user knows the channel + name even when decode breaks.
 */
export default function PlayerSurface({ channel }: { channel?: Channel }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

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
      if (isHls && !canNative) {
        try {
          const mod = (await import('hls.js')) as unknown as { default: new (cfg?: unknown) => unknown };
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
          h.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {/* autoplay blocked */}); });
          h.loadSource(channel!.streamUrl!);
          h.attachMedia(video);
        } catch (e) {
          setErr(`HLS init failed: ${(e as Error).message}`);
        }
      } else {
        video.src = channel!.streamUrl!;
        video.play().catch(() => {/* user gesture required, ignore */});
      }
    }
    attach();

    return () => {
      cancelled = true;
      if (hls) hls.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [channel?.streamUrl]);

  return (
    <div className="player-surface">
      {channel?.streamUrl ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={false}
            controls
            style={{ width: '100%', height: '100%', background: '#000', objectFit: 'contain' }}
            onPlaying={() => setPlaying(true)}
            onWaiting={() => setPlaying(false)}
          />
          {!playing && !err && (
            <div className="player-loading">Tuning {channel.number} · {channel.name}…</div>
          )}
          {err && (
            <div className="player-error">
              <div className="player-error-title">Can't play {channel.name}</div>
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
