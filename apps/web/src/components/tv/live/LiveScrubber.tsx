'use client';

/*
 * LiveScrubber — 10-second skip controller.
 *
 * UX:
 *   ←  jump back 10 s            (show "−10s" badge)
 *   →  jump forward 10 s         (show "+10s" badge)
 *   Hold either arrow            keeps skipping while held; the badge
 *                                tallies the running offset so the user
 *                                sees how far back they've gone.
 *   Enter / Space                commit immediately, otherwise commits
 *                                ~350 ms after the last keystroke.
 *
 * No persistent bottom timeline — the user explicitly asked for a YouTube-
 * style transient badge instead of a percent bar.
 *
 * Auto-repeat: browsers fire keydown ~30×/sec when a key is held. We
 * throttle ticks to ~140 ms (so a held key skips a comfortable ~70 s per
 * second instead of unscrubbable insta-jumps), and add 10 s per tick.
 *
 * Crossing the live edge clears catch-up entirely so the player snaps
 * back to the live URL.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  /** 0 = live, otherwise unix-ms of the catch-up start. */
  catchupMs: number;
  /** Max rewind window in days (defaults to 7). */
  maxRewindDays?: number;
  onSeek:        (newMs: number) => void;
  onReturnLive:  () => void;
  /** True while the fullscreen player overlay is active. */
  active?: boolean;
  /** Called on every skip tick BEFORE the debounced commit, so the
   *  InfoBar progress slider can update immediately. The committed
   *  seek (which actually re-attaches the player) still goes through
   *  onSeek 350 ms later. Null means "back to live preview". */
  onPreview?: (previewMs: number | null) => void;
  /** Kept for source compatibility; the new design has no bottom bar
   *  so this prop is now ignored. */
  infoBarVisible?: boolean;
}

const STEP_MS         = 10_000;
const TICK_THROTTLE_MS = 140;   // min interval between auto-repeat ticks
const COMMIT_IDLE_MS   = 350;
const BADGE_FADE_MS    = 900;

interface Badge {
  dir:    -1 | 1;
  /** Total accumulated offset since the user started this scrub burst,
   *  in seconds (positive number). */
  offsetSec: number;
}

function fmtOffset(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s === 0 ? `${m}m` : `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm === 0 ? `${h}h` : `${h}h ${mm}m`;
}

export default function LiveScrubber({
  catchupMs,
  maxRewindDays = 7,
  onSeek,
  onReturnLive,
  onPreview,
  active = true,
}: Props) {
  const [pendingMs, setPendingMs] = useState<number>(0);
  const [badge,     setBadge]     = useState<Badge | null>(null);

  const lastTickRef    = useRef<number>(0);
  const burstStartRef  = useRef<number>(0); // when the current scrub burst started (ms epoch)
  const commitTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const badgeTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Outside changes (e.g. user clicked "Back to live") rebase pending.
  useEffect(() => { setPendingMs(catchupMs); }, [catchupMs]);

  const commit = useCallback((target: number) => {
    // Crossing the live edge clears catch-up entirely so the player
    // rebuilds with the original live URL — smoother than timeshift.
    if (target >= Date.now() - 15_000) onReturnLive();
    else                                onSeek(target);
  }, [onSeek, onReturnLive]);

  const scheduleCommit = useCallback((target: number) => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => commit(target), COMMIT_IDLE_MS);
  }, [commit]);

  const tick = useCallback((dir: -1 | 1) => {
    const now = Date.now();
    if (now - lastTickRef.current < TICK_THROTTLE_MS) return;
    // If the previous burst was long enough ago, reset the badge counter
    // so a fresh press shows "10s" rather than continuing the last total.
    if (now - lastTickRef.current > 800) burstStartRef.current = 0;
    lastTickRef.current = now;

    setPendingMs((prev) => {
      const baseline = prev || now;
      const earliest = now - maxRewindDays * 86_400_000;
      const ceiling  = now;
      const next     = Math.max(earliest, Math.min(ceiling, baseline + dir * STEP_MS));

      // Track the running total for the badge display.
      if (!burstStartRef.current) burstStartRef.current = prev || now;
      const offsetSec = Math.max(0, Math.round((now - next) / 1_000));

      setBadge({ dir, offsetSec });
      if (badgeTimer.current) clearTimeout(badgeTimer.current);
      badgeTimer.current = setTimeout(() => setBadge(null), BADGE_FADE_MS);

      // Push the optimistic playhead up to the parent so the InfoBar
      // progress slider tracks each keystroke immediately. The real
      // catchupMs only changes after the debounced commit fires.
      onPreview?.(next >= now - 15_000 ? null : next);

      scheduleCommit(next);
      return next;
    });
  }, [maxRewindDays, scheduleCommit, onPreview]);

  // Global key listener — never active while typing into an input.
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)) return;
      if (e.key === 'ArrowLeft') {
        tick(-1);
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        tick(1);
        e.preventDefault();
      } else if ((e.key === 'Enter' || e.key === ' ') && commitTimer.current) {
        clearTimeout(commitTimer.current);
        commitTimer.current = null;
        commit(pendingMs);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, tick, commit, pendingMs]);

  useEffect(() => () => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    if (badgeTimer.current)  clearTimeout(badgeTimer.current);
  }, []);

  if (!active) return null;
  if (!badge)  return null;

  const arrows = badge.dir < 0 ? '«' : '»';
  return (
    <div className={`live-skip-badge ${badge.dir < 0 ? 'back' : 'forward'}`} role="status" aria-live="polite">
      <span className="live-skip-arrows" aria-hidden>{arrows}</span>
      <span className="live-skip-num">{fmtOffset(badge.offsetSec)}</span>
    </div>
  );
}
