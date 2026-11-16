'use client';

// Full-screen player for movies and episodes.
//   /tv/watch?p=<provider>&k=movie|episode&id=<id>&ext=<ext>&t=<title>&img=<poster>
//            [&sid=<series>&si=<seasonIdx>&ei=<episodeIndex>]   (episodes: enables auto-next)
//
// Unlike the live player this uses the browser's native controls: VOD
// needs seeking, and native controls give keyboard, screen-reader and
// fullscreen support for free. HLS goes through hls.js where the browser
// lacks it (with audio / subtitle track pickers); progressive files play
// directly. Position is saved every few seconds for resume.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n';
import { preferNativeHls } from '@/lib/player';
import { getSeries } from '@/lib/providersClient';
import { getProgress, progressKey, saveProgress } from '@/lib/vodProgress';
import '@/components/tv/vod/vod.css';

interface Params {
  p: string; k: 'movie' | 'episode'; id: string; ext: string; t: string; img: string;
  sid?: string; si?: number; ei?: number;
}

interface HlsLike {
  loadSource(u: string): void; attachMedia(v: HTMLVideoElement): void; destroy(): void;
  on(e: string, cb: (...a: unknown[]) => void): void;
  audioTracks: Array<{ name?: string; lang?: string }>; audioTrack: number;
  subtitleTracks: Array<{ name?: string; lang?: string }>; subtitleTrack: number;
  startLoad(): void; recoverMediaError(): void;
}

function readParams(): Params | null {
  const q = new URLSearchParams(window.location.search);
  const p = q.get('p') || '', id = q.get('id') || '', k = q.get('k');
  if (!/^[a-z0-9]{8,32}$/.test(p) || !id || (k !== 'movie' && k !== 'episode')) return null;
  const n = (v: string | null) => (v !== null && /^\d+$/.test(v) ? Number(v) : undefined);
  return { p, k, id, ext: q.get('ext') || 'mp4', t: q.get('t') || '', img: q.get('img') || '', sid: q.get('sid') || undefined, si: n(q.get('si')), ei: n(q.get('ei')) };
}

export default function Watch() {
  const { t } = useT();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<HlsLike | null>(null);
  const [params, setParams] = useState<Params | null>(null);
  const [state, setState] = useState<'loading' | 'playing' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [idle, setIdle] = useState(false);
  const [tracks, setTracks] = useState<{ audio: string[]; subs: string[]; a: number; s: number }>({ audio: [], subs: [], a: 0, s: -1 });
  const [next, setNext] = useState<{ href: string; label: string } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  // useT() returns a new function every render; effects read it through
  // a ref so they do not re-run (and re-fetch the stream) on each render.
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    const p = readParams();
    if (!p) { setState('error'); setErrMsg('Missing title reference.'); return; }
    setParams(p);
  }, []);

  const back = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.push(params?.k === 'episode' ? '/tv/series' : '/tv/movies');
  }, [router, params]);

  // Load the stream.
  useEffect(() => {
    const v = videoRef.current;
    if (!params || !v) return;
    let cancelled = false;
    const t = (k: string) => tRef.current(k);
    setState('loading');
    (async () => {
      let info: { url: string; hls: boolean };
      try {
        const path = `/api/providers/${params.p}/play/${params.k}/${encodeURIComponent(params.id)}.${params.ext}?json=1`;
        const r = await fetch(path, { credentials: 'include' });
        if (r.status === 401) throw new Error(t('live.needSignIn'));
        if (r.status === 402) throw new Error(t('live.trialEnded'));
        if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.message || `${t('vod.cantPlay')} (${r.status})`); }
        info = await r.json();
      } catch (e) {
        if (!cancelled) { setState('error'); setErrMsg((e as Error).message); }
        return;
      }
      if (cancelled) return;
      const resume = getProgress(progressKey(params.p, params.k, params.id));
      const startAt = resume && resume.duration && resume.position / resume.duration < 0.95 ? resume.position : 0;
      const onMeta = () => { if (startAt > 0) v.currentTime = startAt; v.play().catch(() => { /* needs a tap */ }); };
      v.addEventListener('loadedmetadata', onMeta, { once: true });

      if (info.hls && !preferNativeHls(v)) {
        const mod = await import('hls.js');
        if (cancelled) return;
        const Hls = mod.default as unknown as { new (c?: unknown): HlsLike; isSupported(): boolean; Events: Record<string, string>; ErrorTypes: Record<string, string> };
        if (!Hls.isSupported()) { setState('error'); setErrMsg(t('vod.cantPlayBody')); return; }
        const h = new Hls({ maxBufferLength: 60, backBufferLength: 60 });
        hlsRef.current = h;
        let recoveries = 0;
        h.on(Hls.Events.MANIFEST_PARSED, () => {
          setTracks({ audio: h.audioTracks.map((x, i) => x.name || x.lang || `#${i + 1}`), subs: h.subtitleTracks.map((x, i) => x.name || x.lang || `#${i + 1}`), a: h.audioTrack, s: h.subtitleTrack });
        });
        h.on(Hls.Events.ERROR, (...a: unknown[]) => {
          const d = a[1] as { fatal?: boolean; type?: string; response?: { code?: number } };
          if (!d?.fatal) return;
          if (recoveries++ < 2) { if (d.type === Hls.ErrorTypes.MEDIA_ERROR) h.recoverMediaError(); else h.startLoad(); return; }
          setState('error');
          setErrMsg(d.response?.code === 401 ? t('live.needSignIn') : d.response?.code === 402 ? t('live.trialEnded') : t('vod.cantPlayBody'));
        });
        h.loadSource(info.url);
        h.attachMedia(v);
      } else {
        v.src = info.url;
      }
    })();
    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      v.removeAttribute('src');
      v.load();
    };
  }, [params, attempt]);

  // Save progress periodically and when leaving.
  useEffect(() => {
    const v = videoRef.current;
    if (!params || !v) return;
    const save = () => {
      if (!v.duration || !isFinite(v.duration)) return;
      saveProgress({
        key: progressKey(params.p, params.k, params.id), provider: params.p, kind: params.k, id: params.id, ext: params.ext,
        title: params.t, poster: params.img, position: v.currentTime, duration: v.duration, at: Date.now(),
        seriesId: params.sid, season: params.si, episode: params.ei,
      });
    };
    const iv = setInterval(() => { if (!v.paused) save(); }, 5000);
    v.addEventListener('pause', save);
    window.addEventListener('pagehide', save);
    return () => { save(); clearInterval(iv); v.removeEventListener('pause', save); window.removeEventListener('pagehide', save); };
  }, [params]);

  // Episodes: work out the next one for auto-play.
  useEffect(() => {
    if (!params || params.k !== 'episode' || !params.sid || params.si === undefined || params.ei === undefined) return;
    getSeries(params.p, params.sid).then((d) => {
      let si = params.si!, ei = params.ei! + 1;
      if (!d.seasons[si]?.episodes[ei]) { si += 1; ei = 0; }
      const s = d.seasons[si], e = s?.episodes[ei];
      if (!s || !e) return;
      const q = new URLSearchParams({ p: params.p, k: 'episode', id: e.id, ext: e.ext, t: `${d.series.name} · S${s.number}E${e.number}`, img: params.img, sid: params.sid!, si: String(si), ei: String(ei) });
      setNext({ href: `/tv/watch?${q}`, label: `S${s.number}E${e.number}${e.title && !/^Episode \d+$/.test(e.title) ? ` · ${e.title}` : ''}` });
    }).catch(() => { /* no next episode */ });
  }, [params]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) { if (next) window.location.href = next.href; return; }
    const id = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [countdown, next]);

  // Hide the top bar while playing and idle.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const wake = () => { setIdle(false); clearTimeout(timer); timer = setTimeout(() => setIdle(true), 3000); };
    wake();
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', wake);
    window.addEventListener('touchstart', wake, { passive: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'GoBack' || (e.key === 'Escape' && !document.fullscreenElement)) back(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(timer); window.removeEventListener('pointermove', wake); window.removeEventListener('keydown', wake); window.removeEventListener('touchstart', wake); window.removeEventListener('keydown', onKey); };
  }, [back]);

  useEffect(() => {
    document.documentElement.classList.add('ns-player-open');
    return () => document.documentElement.classList.remove('ns-player-open');
  }, []);

  return (
    <div className={`watch ${idle && state === 'playing' ? 'idle' : ''}`}>
      <div className="watch-top">
        <button type="button" className="watch-back" onClick={back} aria-label={t('vod.back')}>‹</button>
        <div className="watch-title">{params?.t}</div>
        {(tracks.audio.length > 1 || tracks.subs.length > 0) && (
          <div className="watch-tracks">
            {tracks.audio.length > 1 && (
              <select aria-label={t('vod.audio')} value={tracks.a} onChange={(e) => { const i = Number(e.target.value); if (hlsRef.current) hlsRef.current.audioTrack = i; setTracks((x) => ({ ...x, a: i })); }}>
                {tracks.audio.map((n, i) => <option key={i} value={i}>{t('vod.audio')}: {n}</option>)}
              </select>
            )}
            {tracks.subs.length > 0 && (
              <select aria-label={t('vod.subtitles')} value={tracks.s} onChange={(e) => { const i = Number(e.target.value); if (hlsRef.current) hlsRef.current.subtitleTrack = i; setTracks((x) => ({ ...x, s: i })); }}>
                <option value={-1}>{t('vod.subtitles')}: {t('vod.off')}</option>
                {tracks.subs.map((n, i) => <option key={i} value={i}>{n}</option>)}
              </select>
            )}
          </div>
        )}
      </div>
      <video
        ref={videoRef}
        controls
        playsInline
        preload="metadata"
        poster={params?.img || undefined}
        onPlaying={() => setState('playing')}
        onError={() => { setState('error'); setErrMsg(t('vod.cantPlayBody')); }}
        onEnded={() => { if (next) setCountdown(8); }}
      />
      {state === 'loading' && <div className="watch-overlay" aria-hidden="true"><div className="watch-spinner" /></div>}
      {state === 'error' && (
        <div className="watch-overlay">
          <div className="watch-card" role="alert">
            <h2>{t('vod.cantPlay')}</h2>
            <p>{errMsg}</p>
            <div className="vod-actions" style={{ justifyContent: 'center' }}>
              <button type="button" className="vod-btn" onClick={() => setAttempt((a) => a + 1)}>{t('vod.retry')}</button>
              <button type="button" className="vod-btn ghost" onClick={back}>{t('vod.back')}</button>
            </div>
          </div>
        </div>
      )}
      {countdown !== null && next && (
        <div className="watch-next" role="status">
          <div>{t('vod.nextIn')} {countdown}s<div className="vod-meta">{next.label}</div></div>
          <a className="vod-btn" href={next.href}>{t('vod.playNow')}</a>
          <button type="button" className="vod-btn ghost" onClick={() => setCountdown(null)}>{t('vod.cancel')}</button>
        </div>
      )}
    </div>
  );
}
