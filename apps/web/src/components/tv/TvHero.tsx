'use client';

/*
 * TvHero — the rotating live-channel showcase at the top of /tv.
 *
 * When the user has a real playlist loaded, the hero cycles through a
 * curated subset of their channels (preferring sports / movies /
 * entertainment) and plays a muted live preview of each one for ~12s
 * before moving on. Click "Play" to open the focused channel in
 * /tv/live; click "More info" to jump straight to the channel rail
 * for context.
 *
 * Falls back to a static splash when no playlist is configured yet so
 * the home page never looks empty.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentZone, useSetZone } from './TvFocus';
import { getCachedChannels, loadChannels } from '@/lib/channelCache';
import { proxiedStreamUrl } from '@/lib/streamProxy';
import type { M3UChannel } from '@/lib/m3u';

const ZONE = 'hero';
const ROTATE_MS = 12_000;

const SHOWCASE = /(sport|movie|cinema|hbo|premium|football|soccer|nba|nfl|champions)/i;
const SKIP     = /(test|placeholder|24\/?7 vod|info channel|backup|adult|xxx)/i;

interface HlsInstance {
  loadSource: (u: string) => void;
  attachMedia: (v: HTMLVideoElement) => void;
  on: (e: string, cb: (...a: unknown[]) => void) => void;
  destroy: () => void;
}
interface HlsCtor {
  new (cfg?: unknown): HlsInstance;
  isSupported: () => boolean;
  Events: { ERROR: string };
}

function pickFeatured(channels: M3UChannel[]): M3UChannel[] {
  if (channels.length === 0) return [];
  const showcase = channels.filter((c) => !SKIP.test(c.name) && SHOWCASE.test(c.name + ' ' + c.category));
  const fallback = channels.filter((c) => !SKIP.test(c.name) && c.logoUrl);
  const pool = (showcase.length >= 3 ? showcase : fallback).slice(0, 8);
  return pool.length > 0 ? pool : channels.slice(0, 5);
}

export default function TvHero() {
  const router    = useRouter();
  const focusHero = useSetZone(ZONE);
  const current   = useCurrentZone();
  const [btn, setBtn] = useState(0);

  const [channels, setChannels] = useState<M3UChannel[]>(
    (typeof window !== 'undefined' ? getCachedChannels() : null) ?? [],
  );
  const [idx, setIdx] = useState(0);
  const [previewFailed, setPreviewFailed] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Hydrate channels (no-op if already in cache).
  useEffect(() => {
    let cancelled = false;
    if (channels.length > 0) return;
    (async () => {
      const parsed = await loadChannels();
      if (!cancelled) setChannels(parsed);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const featured = useMemo(() => pickFeatured(channels), [channels]);
  const current_channel = featured[idx];

  // Auto-rotate.
  useEffect(() => {
    if (featured.length < 2) return;
    const t = setInterval(() => {
      setPreviewFailed(false);
      setIdx((i) => (i + 1) % featured.length);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [featured.length]);

  // Reset failure state when the active channel changes (so the next
  // one gets a fresh attempt).
  useEffect(() => { setPreviewFailed(false); }, [current_channel?.streamUrl]);

  // Live preview lifecycle.
  useEffect(() => {
    if (!current_channel || previewFailed) return;
    const video = videoRef.current;
    if (!video || !current_channel.streamUrl) return;

    let cancelled = false;
    let hls: HlsInstance | null = null;

    (async () => {
      const streamUrl = proxiedStreamUrl(current_channel.streamUrl);
      const isHls    = /\.m3u8(\?|$)/i.test(current_channel.streamUrl);
      const canNative = video.canPlayType('application/vnd.apple.mpegurl') !== '';
      const onFatal = () => { if (!cancelled) setPreviewFailed(true); };

      try {
        video.muted = true;
        video.playsInline = true;
        if (isHls && !canNative) {
          const mod = await import('hls.js');
          if (cancelled) return;
          const Hls = (mod as unknown as { default: HlsCtor }).default;
          if (!Hls.isSupported()) { onFatal(); return; }
          hls = new Hls({ liveSyncDuration: 3, lowLatencyMode: true });
          hls.attachMedia(video);
          hls.loadSource(streamUrl);
          hls.on(Hls.Events.ERROR, onFatal);
        } else {
          video.src = streamUrl;
        }
        await video.play().catch(onFatal);
      } catch {
        onFatal();
      }
    })();

    return () => {
      cancelled = true;
      try { video.pause(); video.removeAttribute('src'); video.load(); } catch { /* ignore */ }
      if (hls) { try { hls.destroy(); } catch { /* ignore */ } }
    };
  }, [current_channel, previewFailed]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (current !== ZONE) return;
      if (e.key === 'ArrowLeft'  && btn > 0) setBtn(btn - 1);
      if (e.key === 'ArrowRight' && btn < 1) setBtn(btn + 1);
      if (e.key === 'Enter') {
        if (current_channel) {
          router.push(`/tv/live?ch=${encodeURIComponent(String(current_channel.number))}`);
        } else {
          router.push('/tv/live');
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [btn, current, current_channel, router]);

  const onPlay = () => {
    if (current_channel) {
      router.push(`/tv/live?ch=${encodeURIComponent(String(current_channel.number))}`);
    } else {
      router.push('/tv/live');
    }
  };
  const onMoreInfo = () => router.push('/tv/live');

  // Pure splash fallback when no playlist is configured.
  if (!current_channel) {
    return (
      <section className="tv-hero" onMouseEnter={focusHero}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="https://picsum.photos/seed/novastream-tv-hero/1920/1080" alt="" />
        <div className="tv-hero-shade" />
        <div className="tv-hero-content">
          <div className="tv-hero-eyebrow">Welcome</div>
          <h1 className="tv-hero-title">Add a playlist to start watching</h1>
          <p className="tv-hero-sub">
            Drop your M3U URL in Account → Sources. Your channels will appear here.
          </p>
          <div className="tv-hero-actions">
            <button
              onClick={() => router.push('/tv/account/sources')}
              className={`tv-btn tv-btn-primary ${current === ZONE && btn === 0 ? 'focused' : ''}`}
            >Add playlist</button>
            <button
              onClick={onMoreInfo}
              className={`tv-btn ${current === ZONE && btn === 1 ? 'focused' : ''}`}
            >Browse demo</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="tv-hero" onMouseEnter={focusHero}>
      <video
        ref={videoRef}
        muted
        playsInline
        preload="none"
        aria-hidden
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          opacity: previewFailed ? 0 : 1,
          transition: 'opacity 480ms ease',
        }}
      />
      {(previewFailed || !current_channel.streamUrl) && current_channel.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={current_channel.logoUrl}
          alt=""
          style={{
            position: 'absolute', inset: 0, margin: 'auto',
            width: '40%', maxHeight: '40%', objectFit: 'contain',
          }}
          onError={() => { /* noop — shade will still cover */ }}
        />
      )}
      <div className="tv-hero-shade" />
      <div className="tv-hero-content">
        <div className="tv-hero-eyebrow">Live now · {current_channel.category}</div>
        <h1 className="tv-hero-title">{current_channel.name}</h1>
        <p className="tv-hero-sub">
          Channel #{current_channel.number} streaming live. Hit Play to open in the channel rail.
        </p>
        <div className="tv-hero-actions">
          <button
            onClick={onPlay}
            className={`tv-btn tv-btn-primary ${current === ZONE && btn === 0 ? 'focused' : ''}`}
          >▶ Play</button>
          <button
            onClick={onMoreInfo}
            className={`tv-btn ${current === ZONE && btn === 1 ? 'focused' : ''}`}
          >Browse all channels</button>
        </div>
        {featured.length > 1 && (
          <div style={{
            display: 'flex', gap: 6, marginTop: 22,
          }}>
            {featured.map((_, i) => (
              <span
                key={i}
                style={{
                  width: i === idx ? 22 : 8, height: 4, borderRadius: 2,
                  background: i === idx ? '#fff' : 'rgba(255,255,255,0.35)',
                  transition: 'width 240ms ease, background 240ms ease',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
