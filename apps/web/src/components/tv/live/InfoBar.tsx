'use client';

import { useEffect, useState } from 'react';
import type { Channel } from './types';
import { userKey } from '@/lib/session';

interface Props {
  channel?: Channel;
  visible: boolean;
  onDismiss: () => void;
  onTune: (idx: number) => void;
  channels: Channel[];
  activeIdx: number;
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

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Tab/Left/Right move focus across the three action buttons when the bar
  // is open. We deliberately consume those keys only when visible so the
  // channel rail handles arrow keys when the bar is hidden.
  useEffect(() => {
    if (!p.visible) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') { setFocused((i) => Math.min(i + 1, 2)); e.preventDefault(); }
      if (e.key === 'ArrowLeft')  { setFocused((i) => Math.max(i - 1, 0)); e.preventDefault(); }
      if (e.key === 'Escape' || e.key === 'GoBack') { p.onDismiss(); }
      if (e.key === 'Enter') {
        if (focused === 0) doRestart();
        if (focused === 1) doRecord();
        if (focused === 2) setCard(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p, focused]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }
  function doRestart() {
    if (!p.channel?.now) return;
    // Production: catch-up service. Demo: seek the live <video> back
    // to its earliest buffered point so the user sees a visible effect.
    const video = document.querySelector<HTMLVideoElement>('.player-surface video');
    if (video?.buffered.length) {
      try { video.currentTime = video.buffered.start(0); } catch { /* ignore */ }
    }
    flash(`Restarting "${p.channel.now.title}" from the beginning…`);
  }
  function doRecord() {
    if (!p.channel) return;
    addRecording(p.channel);
    flash(`Recording scheduled · ${p.channel.now?.title ?? p.channel.name}`);
  }

  if (!p.channel) return null;
  const ch = p.channel;
  const progress = ch.now ? clamp01((Date.now() - ch.now.start.getTime()) / (ch.now.stop.getTime() - ch.now.start.getTime())) : 0;
  const canRestart = !!ch.now?.catchupAvailable;

  return (
    <>
      <div className={`infobar ${p.visible ? 'visible' : ''}`}>
        <div className="infobar-row1">
          <span className="infobar-num">{ch.number}</span>
          <span className="infobar-logo">
            {ch.logoUrl
              ? <img src={ch.logoUrl} alt="" />
              : <span style={{ color: '#5A6070', fontSize: 12, fontWeight: 700 }}>{ch.name.slice(0, 3)}</span>}
          </span>
          <span className="infobar-chname">{ch.name}</span>
          <span className="infobar-clock">{fmtClock(clock)}</span>
        </div>

        <div className="infobar-row2">
          <div>
            <h2 className="infobar-now-title">{ch.now?.title ?? '—'}</h2>
            {ch.now && (
              <div className="infobar-now-time">
                {fmtHM(ch.now.start)} – {fmtHM(ch.now.stop)}
                {' · '}
                {durationMin(ch.now.start, ch.now.stop)} min
              </div>
            )}
            {ch.now?.description && <p className="infobar-now-desc">{ch.now.description}</p>}
            <div className="progressbar">
              <div className="progressbar-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="infobar-actions">
              <button
                className={`infobar-btn primary ${focused === 0 ? 'focused' : ''}`}
                disabled={!canRestart && !ch.now}
                onClick={doRestart}
                title={canRestart ? 'Restart programme from beginning' : 'Restart from the start of the buffer'}
              >
                ↺ Restart programme
              </button>
              <button
                className={`infobar-btn ${focused === 1 ? 'focused' : ''}`}
                onClick={doRecord}
              >
                ● Record
              </button>
              <button
                className={`infobar-btn ${focused === 2 ? 'focused' : ''}`}
                onClick={() => setCard(true)}
              >
                ⓘ More info
              </button>
            </div>
          </div>

          <div className="infobar-next">
            <div className="infobar-next-title">Coming up</div>
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
              <button className="infobar-btn primary" onClick={() => { setCard(false); doRecord(); }}>● Record</button>
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
