'use client';

import { useEffect, useState } from 'react';
import type { Channel } from './types';

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
 *   Restart from beginning — uses the catch-up TV system to start the
 *                            current programme from its start time. The
 *                            most-requested missing feature in IPTV apps.
 *   Record                 — schedules a one-off recording of the
 *                            currently-playing programme.
 *   More info              — opens the full programme card (cast,
 *                            categories, year, related programmes).
 *
 * The bar auto-hides 6 seconds after the last action; pressing Info on
 * the remote toggles it; pressing OK on a channel re-surfaces it.
 */
export default function InfoBar(p: Props) {
  const [clock, setClock] = useState(new Date());
  const [focused, setFocused] = useState(0);

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
        if (focused === 0) restart(p.channel);
        if (focused === 1) record(p.channel);
        if (focused === 2) moreInfo(p.channel);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p, focused]);

  if (!p.channel) return null;
  const ch = p.channel;
  const progress = ch.now ? clamp01((Date.now() - ch.now.start.getTime()) / (ch.now.stop.getTime() - ch.now.start.getTime())) : 0;
  const canRestart = !!ch.now?.catchupAvailable;

  return (
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
              disabled={!canRestart}
              onClick={() => restart(ch)}
              title={canRestart ? 'Restart programme from beginning' : 'Catch-up not available for this programme'}
            >
              ↺ Restart programme
            </button>
            <button
              className={`infobar-btn ${focused === 1 ? 'focused' : ''}`}
              onClick={() => record(ch)}
            >
              ● Record
            </button>
            <button
              className={`infobar-btn ${focused === 2 ? 'focused' : ''}`}
              onClick={() => moreInfo(ch)}
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
  );
}

function restart(ch?: Channel) {
  if (!ch?.now) return;
  // Real client: POST /api/playback/catchup {channelId, startAt}
  // → tickets endpoint replies with a manifestURL whose first segment is the
  // segment at the requested wall-clock time.
  console.info('[restart]', ch.id, ch.now.title, ch.now.start.toISOString());
}

function record(ch?: Channel) {
  if (!ch?.now) return;
  // Real client: POST /api/dvr/recordings
  console.info('[record]', ch.id, ch.now.title);
}

function moreInfo(ch?: Channel) {
  if (!ch?.now) return;
  // Real client: router.push(`/tv/programme/${ch.now.id}`)
  console.info('[info]', ch.id, ch.now.title);
}

function clamp01(x: number) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function fmtHM(d: Date) {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function fmtClock(d: Date) { return fmtHM(d); }
function durationMin(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}
