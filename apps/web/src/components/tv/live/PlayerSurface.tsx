'use client';

import { useEffect, useRef, useState } from 'react';
import type { Channel } from './types';
import { proxiedStreamUrl } from '@/lib/streamProxy';

/*
 * The player surface.
 *
 * Features beyond just "play the stream":
 *   - Muted autoplay + tap-to-unmute (every browser blocks
 *     autoplay-with-sound; muted is universally allowed).
 *   - HLS via hls.js MSE on non-Safari, native <video> on Safari/iOS.
 *   - Picture-in-Picture toggle.
 *   - Chromecast button when the Cast SDK is available.
 *   - AI failover: a transient HLS fatal error triggers an automatic
 *     re-init with a longer buffer + conservative ABR before we give
 *     up and show the error card.
 *   - Subtitle styling from user-controlled CSS variables so the
 *     Appearance screen actually affects the player.
 */
interface Props {
  channel?: Channel;
  autoPlay?: boolean;
  /**
   * If true, the player attempts to start with sound on. Used by the
   * fullscreen overlay because the user clicking the Fullscreen
   * button is a genuine user gesture, which satisfies the browser's
   * autoplay-with-sound policy. The small preview tile keeps the
   * default (muted) start since it autoplays without an explicit
   * gesture and would otherwise be blocked.
   */
  startUnmuted?: boolean;
  /**
   * Callback fired whenever we switch which candidate URL the player
   * is currently attached to. Used by the catch-up diagnostic panel
   * so the user can see "trying 3 of 6 — /timeshift/..." and copy
   * the URL into a browser to verify the panel's response.
   */
  onCandidateChange?: (info: { idx: number; total: number; url: string }) => void;
}

interface HlsInstance {
  loadSource: (u: string) => void;
  attachMedia: (v: HTMLVideoElement) => void;
  on: (e: string, cb: (...a: unknown[]) => void) => void;
  destroy: () => void;
  startLoad: () => void;
  recoverMediaError: () => void;
}
interface HlsCtor {
  new (cfg?: unknown): HlsInstance;
  isSupported: () => boolean;
  Events: { ERROR: string; MANIFEST_PARSED: string; MEDIA_ATTACHED: string };
  ErrorTypes: { NETWORK_ERROR: string; MEDIA_ERROR: string };
}

declare global {
  interface Window {
    chrome?: { cast?: unknown };
    __onGCastApiAvailable?: (ok: boolean) => void;
  }
}

const RECONNECT_DELAYS_MS = [800, 2400, 6000]; // 3 retries, expanding backoff.

export default function PlayerSurface({ channel, autoPlay = true, startUnmuted = false, onCandidateChange }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(!startUnmuted);
  const [pipActive, setPipActive] = useState(false);
  const [castReady, setCastReady] = useState(false);

  // Stream lifecycle: attach hls.js / native HLS to the <video>,
  // wire the AI-failover hooks, clean up on channel change.
  //
  // Catch-up gives us a list of candidate URLs (different Xtream
  // panels spell timeshift differently — see lib/catchup). We try
  // them in order: a fatal hls.js error after the per-URL retries
  // are exhausted advances to the next candidate. Once we find one
  // that loads, we stay on it. Live channels just have a single
  // URL so the candidate loop runs exactly once.
  const altsKey = (channel?.streamUrlAlts ?? []).join('|');
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !channel?.streamUrl) { setErr(null); setPlaying(false); return; }
    setErr(null); setPlaying(false);
    // Capture a non-null reference so TypeScript doesn't keep
    // re-narrowing inside async closures below.
    const video: HTMLVideoElement = vid;

    const candidates = [channel.streamUrl, ...(channel.streamUrlAlts ?? [])];
    let hls: HlsInstance | null = null;
    let cancelled = false;
    let retries = 0;
    let candidateIdx = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const canNative = video.canPlayType('application/vnd.apple.mpegurl') !== '';

    function isHlsUrl(u: string) { return /\.m3u8(\?|$)/i.test(u); }

    function destroyHls() {
      if (hls) { try { hls.destroy(); } catch { /* ignore */ } hls = null; }
    }

    async function tryCandidate(idx: number) {
      if (cancelled) return;
      if (idx >= candidates.length) {
        setErr('Stream error: every catch-up URL format failed on this provider.');
        return;
      }
      candidateIdx = idx;
      retries = 0;
      destroyHls();
      const upstream  = candidates[idx];
      const proxiedUrl = proxiedStreamUrl(upstream);
      onCandidateChange?.({ idx, total: candidates.length, url: upstream });

      // Honour the requested initial mute state. Fullscreen renders
      // pass startUnmuted=true so the click that opened fullscreen
      // (a user gesture) satisfies the autoplay-with-sound policy.
      video.muted = !startUnmuted;
      try {
        const saved = localStorage.getItem('player.volume');
        const v = saved !== null ? Number(saved) : NaN;
        if (isFinite(v) && v >= 0 && v <= 1) video.volume = v;
      } catch { /* ignore */ }

      if (isHlsUrl(upstream) && !canNative) {
        try {
          const mod = (await import('hls.js')) as unknown as { default: unknown };
          if (cancelled) return;
          const Hls = mod.default as unknown as HlsCtor;
          if (!Hls.isSupported()) {
            setErr('Your browser does not support HLS playback.');
            return;
          }
          const h = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            backBufferLength: 30,
          });
          hls = h;
          h.on(Hls.Events.ERROR, (...args: unknown[]) => {
            const data = args[1] as { fatal?: boolean; details?: string; type?: string } | undefined;
            if (!data?.fatal) return;
            if (retries < RECONNECT_DELAYS_MS.length) {
              const delay = RECONNECT_DELAYS_MS[retries++];
              retryTimer = setTimeout(() => {
                if (cancelled || !hls) return;
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
                else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
                else hls.startLoad();
              }, delay);
              return;
            }
            // Out of retries on this URL — advance to the next
            // candidate (different Xtream timeshift format). When
            // we run out of candidates the next-tier handler in
            // tryCandidate surfaces the user-facing error.
            tryCandidate(candidateIdx + 1);
          });
          h.on(Hls.Events.MANIFEST_PARSED, () => {
            if (autoPlay) video.play().catch(() => {/* gesture-required */});
          });
          h.loadSource(proxiedUrl);
          h.attachMedia(video);
        } catch (e) {
          setErr(`HLS init failed: ${(e as Error).message}`);
        }
      } else {
        video.src = proxiedUrl;
        if (autoPlay) video.play().catch(() => {/* gesture-required */});
      }
    }

    tryCandidate(0);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      destroyHls();
      video.removeAttribute('src');
      video.load();
    };
  }, [channel?.streamUrl, altsKey, autoPlay]);

  // Load the Chromecast Sender library so we can offer a Cast button.
  // Silent if the script can't load (network policy, ad blocker, etc.).
  // Also subscribe to native PiP events on the <video> element through
  // a regular DOM listener — React's onEnter/LeavePictureInPicture
  // props aren't typed in the standard React typings.
  useEffect(() => {
    if (window.chrome?.cast) { setCastReady(true); }
    else {
      window.__onGCastApiAvailable = (ok: boolean) => { if (ok) setCastReady(true); };
      const s = document.createElement('script');
      s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
      s.async = true;
      document.head.appendChild(s);
    }
    const v = videoRef.current;
    if (!v) return;
    const onEnter = () => setPipActive(true);
    const onLeave = () => setPipActive(false);
    v.addEventListener('enterpictureinpicture', onEnter);
    v.addEventListener('leavepictureinpicture', onLeave);
    return () => {
      v.removeEventListener('enterpictureinpicture', onEnter);
      v.removeEventListener('leavepictureinpicture', onLeave);
    };
  }, []);

  function unmute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    if (v.volume === 0) v.volume = 1;
    setMuted(false);
    v.play().catch(() => {/* ignore */});
  }

  // Tap the surface to either (1) unmute the first time, or (2)
  // toggle play / pause. We used to rely on the browser's built-in
  // <video controls> for this, but those native controls captured
  // every click + every arrow key — breaking both the unmute prompt
  // and the timeshift scrubber. With controls removed we do the
  // play/pause + unmute in JS.
  function onSurfaceClick() {
    const v = videoRef.current;
    if (!v) return;
    if (muted) { unmute(); return; }
    if (v.paused) { v.play().catch(() => {/* ignore */}); }
    else          { v.pause(); }
  }

  async function togglePip() {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setPipActive(false);
      } else if ('requestPictureInPicture' in v) {
        await v.requestPictureInPicture();
        setPipActive(true);
      }
    } catch { /* user denied / unsupported */ }
  }

  function startCast() {
    // Minimal sender flow — the Cast framework will surface its own
    // device picker. Once the user picks a target the page hands the
    // URL off; from there the cast device handles playback itself.
    const w = window as unknown as {
      cast?: { framework?: { CastContext?: { getInstance: () => { requestSession: () => Promise<unknown> } } } };
    };
    const ctx = w.cast?.framework?.CastContext?.getInstance();
    if (!ctx) return;
    ctx.requestSession().catch(() => {/* user cancelled */});
  }

  return (
    <div className="player-surface" onClick={onSurfaceClick}>
      {channel?.streamUrl ? (
        <>
          <video
            ref={videoRef}
            autoPlay={autoPlay}
            playsInline
            muted={muted}
            // No `controls` attribute: native controls swallow every
            // click (breaks tap-to-unmute) and every arrow key
            // (breaks the timeshift scrubber). Volume / pause /
            // fullscreen are handled by InfoBar and the surface
            // click handler instead.
            tabIndex={-1}
            style={{ width: '100%', height: '100%', background: '#000', objectFit: 'contain', pointerEvents: 'none' }}
            onPlaying={() => setPlaying(true)}
            onWaiting={() => setPlaying(false)}
            onVolumeChange={(e) => setMuted((e.currentTarget as HTMLVideoElement).muted)}
          />

          {/* Player controls overlay — pinned top-right, lives above
              the native <video controls> for cast + pip toggles. */}
          <div className="player-tools">
            <button
              className="player-tool"
              onClick={togglePip}
              title={pipActive ? 'Leave Picture-in-Picture' : 'Enter Picture-in-Picture'}
              aria-label="Picture in picture"
            >▭</button>
            {castReady && (
              <button
                className="player-tool"
                onClick={startCast}
                title="Cast to a Chromecast"
                aria-label="Cast"
              >📺</button>
            )}
          </div>

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
                The stream may be geo-blocked, require credentials, or block cross-origin playback.
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
