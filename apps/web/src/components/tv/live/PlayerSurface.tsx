'use client';

import { useEffect, useRef, useState } from 'react';
import type { Channel } from './types';
import { proxiedStreamUrl, onStreamModeChange } from '@/lib/streamProxy';
import { useT } from '@/lib/i18n';

/*
 * The player surface.
 *
 * Features beyond just "play the stream":
 *   - Muted autoplay + tap-to-unmute (every browser blocks
 *     autoplay-with-sound; muted is universally allowed).
 *   - HLS via hls.js MSE on non-Safari, native <video> on Safari/iOS.
 *   - Picture-in-Picture toggle.
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
  /** Maximum auto-quality level index. -1 = unrestricted. */
  autoLevelCapping?: number;
  /** Audio-track preference — write-only on hls.js, but kept here so
   *  TypeScript doesn't complain about the index access. */
  audioTrack?: number;
  audioTracks?: Array<{ id?: number; lang?: string; name?: string; groupId?: string }>;
  subtitleTrack?: number;
  subtitleTracks?: Array<{ id?: number; lang?: string; name?: string; default?: boolean }>;
  subtitleDisplay?: boolean;
  levels?: Array<{ height?: number; bitrate?: number }>;
}
interface HlsCtor {
  new (cfg?: unknown): HlsInstance;
  isSupported: () => boolean;
  Events: { ERROR: string; MANIFEST_PARSED: string; MEDIA_ATTACHED: string };
  ErrorTypes: { NETWORK_ERROR: string; MEDIA_ERROR: string };
}


const RECONNECT_DELAYS_MS = [800, 2400, 6000]; // 3 retries, expanding backoff.

// Read the user's playback preferences directly out of localStorage —
// the player runs as a child of the live page where the prefs hooks
// don't reach. We can't depend on usePersisted here because the
// player exists outside the React tree the toggle writes from.
function readPreference(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = localStorage.getItem(`ns:${userTenantHash()}:${key}`);
    if (raw == null) return '';
    // Tolerate both JSON-stringified ("foo") and raw (foo) values —
    // usePersisted writes JSON, Toggle writes raw, both end up here.
    try { return JSON.parse(raw) as string; }
    catch { return raw; }
  } catch { return ''; }
}
function userTenantHash(): string {
  try {
    const email = (localStorage.getItem('ns.session.email') || '').toLowerCase().trim();
    if (!email) return 'anon';
    let h = 0;
    for (let i = 0; i < email.length; i++) h = ((h << 5) - h + email.charCodeAt(i)) | 0;
    return 'u' + (h >>> 0).toString(36);
  } catch { return 'anon'; }
}

// Apply prefs.audioLang / prefs.subtitleLang / prefs.maxQuality to a
// freshly-attached hls.js instance. hls.js exposes these via mutable
// `audioTrack` / `subtitleTrack` / `autoLevelCapping` properties; we
// pick the matching track by language code (lower-case ISO-639-1).
function applyPreferences(h: HlsInstance): void {
  // Audio language
  const wantAudio = readPreference('prefs.audioLang').toLowerCase();
  if (wantAudio && h.audioTracks?.length) {
    const idx = h.audioTracks.findIndex((t) => (t.lang ?? '').toLowerCase().startsWith(wantAudio));
    if (idx >= 0 && idx !== h.audioTrack) h.audioTrack = idx;
  }
  // Subtitle language. "off" disables; "" means follow audio (no
  // explicit override — hls.js's default selection wins).
  const wantSub = readPreference('prefs.subtitleLang').toLowerCase();
  if (wantSub === 'off') {
    h.subtitleDisplay = false;
    h.subtitleTrack = -1;
  } else if (wantSub && h.subtitleTracks?.length) {
    const idx = h.subtitleTracks.findIndex((t) => (t.lang ?? '').toLowerCase().startsWith(wantSub));
    if (idx >= 0) { h.subtitleTrack = idx; h.subtitleDisplay = true; }
  }
  // Max quality. "auto" means unrestricted; numeric values cap the
  // height; "audio" forces audio-only by capping below the lowest
  // video level.
  const maxQ = readPreference('prefs.maxQuality');
  if (maxQ && maxQ !== 'auto' && h.levels?.length) {
    if (maxQ === 'audio') {
      h.autoLevelCapping = -1; // hls.js picks whatever's lowest, often audio-only
    } else {
      const want = Number(maxQ);
      // Find the index of the highest level whose height <= want.
      let cap = -1;
      h.levels.forEach((lvl, i) => {
        if (typeof lvl.height === 'number' && lvl.height <= want) {
          if (cap < 0 || (h.levels![cap].height ?? 0) < lvl.height) cap = i;
        }
      });
      if (cap >= 0) h.autoLevelCapping = cap;
    }
  } else if (h.autoLevelCapping != null) {
    h.autoLevelCapping = -1;
  }
}

export default function PlayerSurface({ channel, autoPlay = true, startUnmuted = false, onCandidateChange }: Props) {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(!startUnmuted);
  const [pipActive, setPipActive] = useState(false);
  // Cast / AirPlay availability via the Remote Playback API. Chrome
  // exposes video.remote for src-based media (not MSE); Safari maps it
  // to AirPlay, which works with native HLS — exactly our Safari path.
  // The button only renders when a remote device is actually reachable,
  // so users never see a dead control.
  const [castAvailable, setCastAvailable] = useState(false);
  // Bumped whenever the user flips the Direct Streaming toggle. The
  // main stream-lifecycle effect depends on this, so the player
  // tears down and reattaches with the new mode — without it, the
  // toggle silently has no effect on the currently-playing channel.
  const [modeVersion, setModeVersion] = useState(0);
  useEffect(() => onStreamModeChange(() => setModeVersion((v) => v + 1)), []);

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
    // Stall-timeout for the current candidate. The most insidious
    // catch-up failure mode is a Flussonic / Wowza panel that
    // responds to the archive URL with a manifest that PARSES fine
    // (so hls.js fires no error) but whose segments either don't
    // exist or never load. The player sits on "Tuning…" forever
    // because no fatal error ever arrives. The stall timer arms when
    // we attach to the manifest and fires if the video never reaches
    // `playing` before the timeout — at which point we advance to
    // the next candidate (or surface the user-facing error when
    // there is no next candidate).
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    const STALL_MS = 5_000;
    const canNative = video.canPlayType('application/vnd.apple.mpegurl') !== '';

    function isHlsUrl(u: string) { return /\.m3u8(\?|$)/i.test(u); }

    function destroyHls() {
      if (hls) { try { hls.destroy(); } catch { /* ignore */ } hls = null; }
    }

    function clearStall() {
      if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
    }
    // Fires once per attached candidate. We register it as a regular
    // DOM listener instead of relying on the <video onPlaying> prop
    // so the effect closure can manage it directly and so cleanup
    // is deterministic when we switch candidates.
    function onVideoPlaying() { clearStall(); }
    video.addEventListener('playing', onVideoPlaying);

    async function tryCandidate(idx: number) {
      if (cancelled) return;
      if (idx >= candidates.length) {
        setErr('Stream error: every catch-up URL format failed on this provider.');
        return;
      }
      candidateIdx = idx;
      retries = 0;
      destroyHls();
      clearStall();
      const upstream  = candidates[idx];
      const proxiedUrl = proxiedStreamUrl(upstream);
      onCandidateChange?.({ idx, total: candidates.length, url: upstream });

      // Arm the stall timer for THIS candidate. If `playing` doesn't
      // fire before STALL_MS expires we treat the URL as failed even
      // when no error event was emitted. Particularly important for
      // catch-up because some panels return a 200 OK on the archive
      // path with an empty / dead manifest.
      stallTimer = setTimeout(() => {
        if (cancelled) return;
        stallTimer = null;
        tryCandidate(candidateIdx + 1);
      }, STALL_MS);

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
            // Manifest didn't load (typically a 4xx from the upstream)
            // or parsed empty. Retrying the SAME URL won't change
            // anything — advance straight to the next candidate
            // when there is one. Without this short-circuit the
            // catch-up fallback chain wastes ~9 s per URL on a 404
            // before moving on, and the user sits on a black tile
            // for ~30–40 s before the next format gets tried.
            const isPermanent =
              data.details === 'manifestLoadError' ||
              data.details === 'manifestLoadTimeOut' ||
              data.details === 'manifestParsingError' ||
              data.details === 'manifestIncompatibleVersionsError' ||
              data.details === 'levelEmptyError';
            const hasMoreCandidates = candidateIdx + 1 < candidates.length;
            if (isPermanent && hasMoreCandidates) {
              tryCandidate(candidateIdx + 1);
              return;
            }
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
            // Apply the user's playback preferences once the manifest
            // has been parsed — at that point hls.js knows what audio
            // tracks / subtitle tracks / quality levels actually exist.
            try { applyPreferences(h); } catch { /* hls.js shape varies between versions */ }
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
      clearStall();
      video.removeEventListener('playing', onVideoPlaying);
      destroyHls();
      video.removeAttribute('src');
      video.load();
    };
  }, [channel?.streamUrl, altsKey, autoPlay, modeVersion]);

  // Watch remote-playback (Cast / AirPlay) device availability. The
  // watcher resolves per-video-element; re-arm when the channel (and
  // therefore the media attachment) changes.
  useEffect(() => {
    const v = videoRef.current;
    type RemoteCapable = HTMLVideoElement & {
      remote?: {
        watchAvailability?: (cb: (a: boolean) => void) => Promise<number>;
        cancelWatchAvailability?: (id?: number) => Promise<void>;
        prompt: () => Promise<void>;
      };
    };
    const remote = (v as RemoteCapable | null)?.remote;
    if (!remote?.watchAvailability) { setCastAvailable(false); return; }
    let watchId: number | null = null;
    let cancelled = false;
    remote.watchAvailability((available) => { if (!cancelled) setCastAvailable(available); })
      .then((id) => { watchId = id; })
      .catch(() => { /* NotSupported (e.g. MSE attachment) — keep hidden */ });
    return () => {
      cancelled = true;
      if (watchId !== null) remote.cancelWatchAvailability?.(watchId).catch(() => {});
      setCastAvailable(false);
    };
  }, [channel?.streamUrl]);

  async function promptCast() {
    const v = videoRef.current as (HTMLVideoElement & { remote?: { prompt: () => Promise<void> } }) | null;
    try { await v?.remote?.prompt(); } catch { /* user dismissed / unsupported */ }
  }

  // Subscribe to native PiP events on the <video> element through a
  // regular DOM listener — React's onEnter/LeavePictureInPicture props
  // aren't typed in the standard React typings.
  useEffect(() => {
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

  // Force the player into landscape on a portrait phone so the user can
  // watch a 16:9 video at the device's full width. Requires fullscreen
  // first because the Screen Orientation API silently rejects lock
  // calls outside fullscreen on most browsers. If we're already
  // landscape we go back to portrait + exit fullscreen — a single
  // button toggles both directions.
  async function toggleLandscape() {
    type LockableOrientation = ScreenOrientation & {
      lock?: (o: 'landscape' | 'portrait') => Promise<void>;
    };
    const orientation = screen.orientation as LockableOrientation | undefined;
    const isLandscape = !!orientation && orientation.type.startsWith('landscape');
    try {
      if (isLandscape) {
        orientation?.unlock?.();
        if (document.fullscreenElement) await document.exitFullscreen();
        return;
      }
      const surface = videoRef.current?.parentElement;
      if (surface && !document.fullscreenElement) {
        await surface.requestFullscreen({ navigationUI: 'hide' });
      }
      await orientation?.lock?.('landscape');
    } catch { /* unsupported / user denied — fall back silently */ }
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

          {/* Player controls overlay — pinned top-left, sits above the
              native <video> for rotate + pip toggles. SVG icons only,
              localised titles. */}
          <div className="player-tools">
            <button
              className="player-tool"
              onClick={toggleLandscape}
              title={t('live.rotate')}
              aria-label={t('live.rotate')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="12" rx="2"/>
                <path d="M16 3l3 3-3 3"/>
              </svg>
            </button>
            {castAvailable && (
              <button
                className="player-tool"
                onClick={promptCast}
                title={t('live.cast')}
                aria-label={t('live.cast')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2"
                     strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/>
                  <path d="M2 12a9 9 0 0 1 8 8"/>
                  <path d="M2 16a5 5 0 0 1 4 4"/>
                  <line x1="2" y1="20" x2="2.01" y2="20"/>
                </svg>
              </button>
            )}
            <button
              className="player-tool"
              onClick={togglePip}
              title={pipActive ? t('live.pipLeave') : t('live.pip')}
              aria-label={pipActive ? t('live.pipLeave') : t('live.pip')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="14" rx="2"/>
                <rect x="11" y="10" width="9" height="7" rx="1"
                      fill="currentColor" stroke="none"/>
              </svg>
            </button>
          </div>

          {!playing && !err && (
            <div className="player-loading">
              <div className="player-loading-spinner" aria-hidden="true"/>
              <div className="player-loading-text">
                <span className="player-loading-num">{channel.number}</span>
                <span className="player-loading-name">{channel.name}</span>
              </div>
              <div className="player-loading-status">{t('live.tuning')}</div>
            </div>
          )}
          {playing && muted && (
            <button type="button" className="player-unmute" onClick={(e) => { e.stopPropagation(); unmute(); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 5 6 9H2v6h4l5 4z"/>
                <line x1="22" y1="9" x2="16" y2="15"/>
                <line x1="16" y1="9" x2="22" y2="15"/>
              </svg>
              <span>{t('live.tapToUnmute')}</span>
            </button>
          )}
          {err && (
            <div className="player-error">
              <div className="player-error-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8"  x2="12" y2="13"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <div className="player-error-title">{t('live.cantPlay')}</div>
              <div className="player-error-msg">{channel.name} · {err}</div>
              <div className="player-error-hint">{t('live.streamHelp')}</div>
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
