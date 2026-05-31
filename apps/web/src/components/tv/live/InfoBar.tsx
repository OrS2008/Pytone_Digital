'use client';

import { useEffect, useState } from 'react';
import type { Channel } from './types';
import { userKey } from '@/lib/session';
import { useT } from '@/lib/i18n';

interface Props {
  channel?: Channel;
  visible: boolean;
  onDismiss: () => void;
  onTune: (idx: number) => void;
  channels: Channel[];
  activeIdx: number;
  /**
   * Exit catch-up and play the live edge of the current channel.
   * Implemented at the page level because the URL swap (catch-up
   * URL → live URL) is owned there.
   */
  onReturnLive?: () => void;
  /**
   * Restart the current programme from its EPG start time. Same
   * reason: it needs to flip catch-up mode on, which is page state.
   */
  onRestartProgramme?: () => void;
  /** True when the player is already in catch-up mode. */
  inCatchup?: boolean;
}

/*
 * Bottom info bar (the "channel banner" HOT/YES/FreeTV users expect).
 *
 * Shows: channel number, logo, name, current time, current programme with
 * description and progress bar, next two programmes, and three actions:
 *
 *   Restart programme — replay the current programme from the start.
 *                       In production this calls the catch-up service;
 *                       here we toast the intent and seek the player to
 *                       the live edge so the user gets visible feedback.
 *   Record            — appends to a per-tenant recordings list in
 *                       localStorage and toasts confirmation. When the
 *                       DVR backend is up this becomes the real
 *                       schedule call.
 *   More info         — opens an inline programme card overlay with
 *                       the description and the next two slots.
 */

interface Recording {
  id:        string;
  channelId: string;
  number:    number;
  channel:   string;
  title:     string;
  startsAt:  number;
  stopsAt:   number;
  scheduledAt: number;
}

function addRecording(ch: Channel) {
  if (!ch.now) return;
  try {
    const key = userKey('recordings');
    const raw = localStorage.getItem(key);
    const list: Recording[] = raw ? JSON.parse(raw) : [];
    const entry: Recording = {
      id:          `rec-${Date.now()}`,
      channelId:   ch.id,
      number:      ch.number,
      channel:     ch.name,
      title:       ch.now.title,
      startsAt:    ch.now.start.getTime(),
      stopsAt:     ch.now.stop.getTime(),
      scheduledAt: Date.now(),
    };
    // Dedupe: don't add the same programme twice.
    if (!list.some((r) => r.channelId === entry.channelId && r.title === entry.title && r.startsAt === entry.startsAt)) {
      list.unshift(entry);
      localStorage.setItem(key, JSON.stringify(list.slice(0, 100)));
    }
  } catch { /* ignore */ }
}

export default function InfoBar(p: Props) {
  const [clock, setClock] = useState(new Date());
  const [focused, setFocused] = useState(0);
  const [toast, setToast]     = useState<string | null>(null);
  const [card,  setCard]      = useState(false);
  // Volume persists across channel changes via localStorage so the user
  // doesn't have to re-set it every time they zap. Default 80 % is a
  // reasonable "loud enough but not blown" starting point.
  const [volume, setVolume] = useState(() => {
    if (typeof window === 'undefined') return 0.8;
    try {
      const raw = localStorage.getItem(userKey('player.volume'));
      const v = raw === null ? 0.8 : Number(raw);
      return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8;
    } catch { return 0.8; }
  });
  const [muted, setMuted] = useState(true);
  const { t } = useT();
  // Four buttons in order: 0=return-to-live, 1=restart, 2=record, 3=more-info.
  const BTN_COUNT = 4;

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Sync our muted/volume state with the actual <video> element.
  // The video is the source of truth — PlayerSurface decides the
  // initial mute (fullscreen starts unmuted because the click was a
  // gesture; preview starts muted because autoplay-with-sound is
  // blocked). We only WRITE to the video in response to user actions
  // on the slider / mute button; otherwise we just observe and
  // mirror it here.
  useEffect(() => {
    const v = document.querySelector<HTMLVideoElement>('.player-surface video');
    if (!v) return;
    const sync = () => { setMuted(v.muted); setVolume(v.volume); };
    sync();
    v.addEventListener('volumechange', sync);
    return () => v.removeEventListener('volumechange', sync);
  }, [p.channel?.streamUrl]);

  // Tab moves focus across the action buttons when the bar is open.
  // We used to bind Left / Right too, but the player overlay claims
  // arrow keys for the timeshift scrubber — sharing them confused
  // users who pressed ← expecting to rewind and got button focus
  // instead. Esc dismisses the bar. Enter triggers the focused button.
  useEffect(() => {
    if (!p.visible) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Tab') {
        const dir = e.shiftKey ? -1 : 1;
        setFocused((i) => (i + dir + BTN_COUNT) % BTN_COUNT);
        e.preventDefault();
      }
      if (e.key === 'Escape' || e.key === 'GoBack') { p.onDismiss(); }
      if (e.key === 'Enter') {
        if (focused === 0) doReturnLive();
        if (focused === 1) doRestart();
        if (focused === 2) doRecord();
        if (focused === 3) setCard(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p, focused]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }
  function videoEl(): HTMLVideoElement | null {
    return document.querySelector<HTMLVideoElement>('.player-surface video');
  }
  function doReturnLive() {
    // Page-level callback flips off catch-up mode and reloads the
    // player with the live URL. We also nudge the <video> to the
    // live edge for the case where we're already on a live HLS
    // stream and just need to re-sync.
    if (p.onReturnLive) p.onReturnLive();
    const v = videoEl();
    if (v) {
      try {
        if (v.seekable.length) {
          v.currentTime = Math.max(0, v.seekable.end(v.seekable.length - 1) - 0.5);
        }
        v.play().catch(() => {/* ignore */});
      } catch { /* ignore */ }
    }
    flash(t('live.returnLive'));
  }
  function doRestart() {
    if (!p.channel?.now) {
      flash('No programme guide for this channel.');
      return;
    }
    // Page-level callback rebuilds the catch-up URL using the
    // programme's start time and reloads the player. Without it
    // (older callers) we fall back to seeking the buffer.
    if (p.onRestartProgramme) {
      p.onRestartProgramme();
      flash(`${t('live.restart')} · ${p.channel.now.title}`);
      return;
    }
    const v = videoEl();
    if (v?.buffered.length) {
      try { v.currentTime = v.buffered.start(0); } catch { /* ignore */ }
    }
    flash(`${t('live.restart')} · ${p.channel.now.title}`);
  }
  function doRecord() {
    if (!p.channel) return;
    addRecording(p.channel);
    flash(`${t('live.record')} · ${p.channel.now?.title ?? p.channel.name}`);
  }
  function toggleMute() {
    const v = videoEl();
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    // If the user unmutes from a zero-volume state, raise it to
    // something audible — otherwise unmute looks like a no-op.
    if (!next && v.volume === 0) v.volume = 0.6;
    // The video's volumechange event will sync our React state.
  }
  function setVideoVolume(next: number) {
    const v = videoEl();
    if (!v) return;
    v.volume = next;
    // Slider above 0 implies the user wants sound. Slider at 0 mutes.
    if (next > 0 && v.muted) v.muted = false;
    if (next === 0)          v.muted = true;
    try { localStorage.setItem(userKey('player.volume'), String(next)); } catch { /* ignore */ }
  }

  if (!p.channel) return null;
  const ch = p.channel;
  const progress = ch.now ? clamp01((Date.now() - ch.now.start.getTime()) / (ch.now.stop.getTime() - ch.now.start.getTime())) : 0;
  const canRestart = !!ch.now && (!!ch.catchupSource || !!ch.catchupKind);

  return (
    <>
      <div className={`infobar ${p.visible ? 'visible' : ''}`}>
        {/* Header: channel chip + clock. */}
        <div className="infobar-header">
          <div className="infobar-header-chip">
            <span className="infobar-num">{ch.number}</span>
            <span className="infobar-logo">
              {ch.logoUrl
                ? <img src={ch.logoUrl} alt="" />
                : <span style={{ color: '#5A6070', fontSize: 12, fontWeight: 700 }}>{ch.name.slice(0, 3)}</span>}
            </span>
            <span className="infobar-chname">{ch.name}</span>
            {p.inCatchup && <span className="infobar-mode-chip">CATCH-UP</span>}
          </div>
          <span className="infobar-clock">{fmtClock(clock)}</span>
        </div>

        {/* Body: programme metadata on the left, Coming Up panel on the right. */}
        <div className="infobar-body">
          <div className="infobar-now">
            <h2 className="infobar-now-title">{ch.now?.title ?? ch.name}</h2>
            {ch.now ? (
              <div className="infobar-now-meta">
                <span>{fmtHM(ch.now.start)} – {fmtHM(ch.now.stop)}</span>
                <span className="infobar-now-meta-dot">·</span>
                <span>{durationMin(ch.now.start, ch.now.stop)} min</span>
              </div>
            ) : (
              <div className="infobar-now-meta infobar-now-meta-empty">Live stream</div>
            )}
            {ch.now?.description && <p className="infobar-now-desc">{ch.now.description}</p>}
            {ch.now && (
              <div className="progressbar" title={`${Math.round(progress * 100)}%`}>
                <div className="progressbar-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            )}
          </div>

          {(ch.next1 || ch.next2) && (
            <aside className="infobar-next">
              <div className="infobar-next-title">{t('live.comingUp')}</div>
              {ch.next1 && (
                <div className="infobar-next-row">
                  <div className="infobar-next-time">{fmtHM(ch.next1.start)}</div>
                  <div className="infobar-next-name">{ch.next1.title}</div>
                </div>
              )}
              {ch.next2 && (
                <div className="infobar-next-row">
                  <div className="infobar-next-time">{fmtHM(ch.next2.start)}</div>
                  <div className="infobar-next-name">{ch.next2.title}</div>
                </div>
              )}
            </aside>
          )}
        </div>

        {/* Footer: actions on the left, volume control on the right. */}
        <div className="infobar-footer">
          <div className="infobar-actions">
            <button
              className={`infobar-btn ${p.inCatchup ? 'primary' : ''} ${focused === 0 ? 'focused' : ''}`}
              onClick={doReturnLive}
              title={t('live.returnLive')}
            >
              <span className="infobar-btn-icon">▶</span>
              <span>{t('live.returnLive')}</span>
            </button>
            <button
              className={`infobar-btn ${focused === 1 ? 'focused' : ''}`}
              disabled={!canRestart}
              onClick={doRestart}
              title={canRestart
                ? `Restart "${ch.now?.title}"`
                : 'Restart not available — channel has no catch-up'}
            >
              <span className="infobar-btn-icon">↺</span>
              <span>{t('live.restart')}</span>
            </button>
            <button
              className={`infobar-btn ${focused === 2 ? 'focused' : ''}`}
              disabled={!ch.now}
              onClick={doRecord}
              title={ch.now ? `Record "${ch.now.title}"` : 'No programme to record'}
            >
              <span className="infobar-btn-icon" style={{ color: '#FF3B6E' }}>●</span>
              <span>{t('live.record')}</span>
            </button>
            <button
              className={`infobar-btn ${focused === 3 ? 'focused' : ''}`}
              onClick={() => setCard(true)}
            >
              <span className="infobar-btn-icon">ⓘ</span>
              <span>{t('live.moreInfo')}</span>
            </button>
          </div>

          <div className="infobar-volume">
            <button
              className="infobar-volume-btn"
              onClick={toggleMute}
              title={muted ? 'Unmute' : 'Mute'}
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round((muted ? 0 : volume) * 100)}
              onChange={(e) => setVideoVolume(Number(e.target.value) / 100)}
              className="infobar-volume-slider"
              aria-label="Volume"
            />
            <span className="infobar-volume-pct">
              {muted ? 0 : Math.round(volume * 100)}%
            </span>
          </div>
        </div>
      </div>

      {toast && <div className="infobar-toast">{toast}</div>}

      {card && (
        <div className="infobar-modal" role="dialog" aria-modal="true" onClick={() => setCard(false)}>
          <div className="infobar-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="infobar-modal-eyebrow">{ch.number} · {ch.name}</div>
            <h3 className="infobar-modal-title">{ch.now?.title ?? ch.name}</h3>
            {ch.now && (
              <div className="infobar-modal-time">
                {fmtHM(ch.now.start)} – {fmtHM(ch.now.stop)} · {durationMin(ch.now.start, ch.now.stop)} min
              </div>
            )}
            {ch.now?.description && <p className="infobar-modal-desc">{ch.now.description}</p>}
            <div className="infobar-modal-actions">
              <button className="infobar-btn primary" onClick={() => { setCard(false); doRecord(); }}>● {t('live.record')}</button>
              <button className="infobar-btn"          onClick={() => setCard(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function clamp01(x: number) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function fmtHM(d: Date) {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function fmtClock(d: Date) { return fmtHM(d); }
function durationMin(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}
