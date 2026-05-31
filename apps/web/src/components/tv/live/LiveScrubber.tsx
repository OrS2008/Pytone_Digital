'use client';

/*
 * LiveScrubber — keyboard / remote driven timeshift seek.
 *
 *   ←  jump back  10 s    (accelerates on continuous press)
 *   →  jump forward 10 s  (accelerates, stops at live edge)
 *   Enter / Space — commit immediately (otherwise commits after a
 *   short idle pause)
 *
 * UX:
 *   - While the user is scrubbing we show a centered floating badge
 *     ("⏪ −30 s from live") and a horizontal mini-timeline at the
 *     bottom showing the seek position relative to the catch-up
 *     window (channel.catchupDays back ↔ live edge).
 *   - Pending delta is held in local state, NOT pushed to the player,
 *     so the player isn't torn down on every keystroke. The change
 *     is committed (setCatchupMs) once the user pauses for 400 ms —
 *     at that point the player rebuilds with the timeshift URL.
 *   - When the seek crosses the live edge we clear catch-up entirely
 *     (onReturnLive) so the player snaps back to live HLS.
 *
 * Acceleration: each press within the auto-repeat window grows the
 * jump size. The browser's own key-repeat fires keydown 20–30 times
 * per second when held, so we get smooth fast-forward / rewind for
 * free.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/i18n';

interface Props {
  /** 0 = live, otherwise unix-ms of the catch-up start. */
  catchupMs: number;
  /** Max rewind window in days (defaults to 7). */
  maxRewindDays?: number;
  onSeek:        (newMs: number) => void;
  onReturnLive:  () => void;
  /** True while the fullscreen player overlay is active. */
  active?: boolean;
  /**
   * True while the bottom InfoBar is on screen. We hide the
   * scrubber's bottom timeline in that case so it doesn't sit on
   * top of the programme description — the floating "−30 s" flash
   * still appears because it lives well above any chrome.
   */
  infoBarVisible?: boolean;
}

const BASE_STEP_MS   = 10_000;      // first press is 10 s
const MAX_STEP_MS    = 5 * 60_000;  // cap at 5 min so a long hold doesn't overshoot
const ACCEL_FACTOR   = 1.25;        // each repeat grows the step by 25 %
const ACCEL_RESET_MS = 600;         // ≥ 600 ms gap resets the step
const COMMIT_IDLE_MS = 400;         // commit after this much idle time
const OVERLAY_FADE_MS = 1_400;

export default function LiveScrubber({
  catchupMs,
  maxRewindDays = 7,
  onSeek,
  onReturnLive,
  active = true,
  infoBarVisible = false,
}: Props) {
  const { t } = useT();
  // pendingMs is the staged target timestamp — the player hasn't been
  // told about it yet. catchupMs reflects what the player is actually
  // playing.
  const [pendingMs, setPendingMs] = useState<number>(0);
  const [overlay,   setOverlay]   = useState<string | null>(null);

  const stepRef       = useRef<number>(BASE_STEP_MS);
  const lastPressRef  = useRef<number>(0);
  const commitTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Synchronise pending with the actual playing position whenever the
  // outside world changes it (e.g. user clicked "Back to live" or
  // tuned a different channel).
  useEffect(() => {
    setPendingMs(catchupMs);
  }, [catchupMs]);

  const flashOverlay = useCallback((text: string) => {
    setOverlay(text);
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => setOverlay(null), OVERLAY_FADE_MS);
  }, []);

  const commit = useCallback((target: number) => {
    // Crossing back over the live edge clears catch-up entirely so
    // the player rebuilds with the original live URL (which is
    // always a smoother stream than timeshift on most panels).
    if (target >= Date.now() - 15_000) {
      onReturnLive();
    } else {
      onSeek(target);
    }
  }, [onSeek, onReturnLive]);

  const scheduleCommit = useCallback((target: number) => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => commit(target), COMMIT_IDLE_MS);
  }, [commit]);

  // The actual seek step. Called per ArrowLeft / ArrowRight press.
  const step = useCallback((dir: -1 | 1) => {
    const now = Date.now();
    // Reset acceleration if the user paused between presses, otherwise
    // grow it geometrically.
    if (now - lastPressRef.current > ACCEL_RESET_MS) {
      stepRef.current = BASE_STEP_MS;
    } else {
      stepRef.current = Math.min(MAX_STEP_MS, Math.round(stepRef.current * ACCEL_FACTOR));
    }
    lastPressRef.current = now;

    setPendingMs((prev) => {
      const baseline = prev || now;
      const earliest = now - maxRewindDays * 86_400_000;
      const ceiling  = now;  // never go past live
      const next     = Math.max(earliest, Math.min(ceiling, baseline + dir * stepRef.current));

      const offsetMin = Math.max(0, Math.round((now - next) / 60_000));
      const offsetSec = Math.max(0, Math.round((now - next) / 1_000));
      let label: string;
      if (next >= now - 15_000) {
        label = t('live.scrubber.live');
      } else if (offsetSec < 60) {
        label = `⏪ −${offsetSec}s`;
      } else if (offsetMin < 60) {
        label = `⏪ −${offsetMin}m`;
      } else {
        const h = Math.floor(offsetMin / 60);
        const m = offsetMin % 60;
        label = `⏪ −${h}h ${m}m`;
      }
      flashOverlay(label);
      scheduleCommit(next);
      return next;
    });
  }, [flashOverlay, scheduleCommit, maxRewindDays, t]);

  // Global key listener. Only active while the player is on-screen,
  // and never when the user is typing into an input.
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)) return;
      if (e.key === 'ArrowLeft') {
        step(-1);
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        step(1);
        e.preventDefault();
      } else if ((e.key === 'Enter' || e.key === ' ') && commitTimer.current) {
        // Force-commit on Enter so remote users can finish a long
        // scrub without waiting for the idle window.
        clearTimeout(commitTimer.current);
        commitTimer.current = null;
        commit(pendingMs);
      }
    }
    function onUp(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        // Reset acceleration on key release so the next press starts
        // at the base step again.
        stepRef.current = BASE_STEP_MS;
      }
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup',   onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup',   onUp);
    };
  }, [active, step, commit, pendingMs]);

  // Clean up timers on unmount so a stale commit doesn't fire after
  // the user has tuned a different channel.
  useEffect(() => () => {
    if (commitTimer.current)  clearTimeout(commitTimer.current);
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
  }, []);

  if (!active) return null;

  const now = Date.now();
  const earliest = now - maxRewindDays * 86_400_000;
  const inCatchup = pendingMs > 0 && pendingMs < now - 15_000;
  // Map pendingMs onto a 0..1 position across the catch-up window.
  // 0 = oldest replayable moment, 1 = live edge.
  const pct = inCatchup
    ? ((pendingMs - earliest) / (now - earliest)) * 100
    : 100;

  return (
    <>
      {/* Floating "−30s" / "+1m" badge during active scrubbing. */}
      {overlay && (
        <div className="live-scrubber-flash" role="status" aria-live="polite">
          {overlay}
        </div>
      )}

      {/* Bottom mini-timeline. Hidden while the InfoBar is showing
          (it would otherwise sit on top of the programme description
          — see screenshot regression report). In live mode the
          marker sits flush on the right edge; in catch-up it
          tracks the pending position. */}
      {!infoBarVisible && (
      <div className="live-scrubber-bar" aria-hidden>
        <div className="live-scrubber-bar-track">
          <div className="live-scrubber-bar-fill" style={{ width: `${pct}%` }} />
          <div className="live-scrubber-bar-head" style={{ left: `${pct}%` }} />
          <div className="live-scrubber-bar-live" />
        </div>
        <div className="live-scrubber-bar-labels">
          <span>{t('live.scrubber.hint')}</span>
          {inCatchup ? (
            <button type="button" className="live-scrubber-bar-back" onClick={onReturnLive}>
              {t('live.scrubber.returnLive')}
            </button>
          ) : (
            <span className="live-scrubber-bar-live-label">● {t('live.scrubber.live')}</span>
          )}
        </div>
      </div>
      )}
    </>
  );
}
