'use client';

/*
 * LiveScrubber — compact pill above the bottom info bar that lets the
 * user jump backward in time on a live channel, then jump back to the
 * live edge with one click.
 *
 * How it composes with the rest of /tv/live:
 *
 *   - In LIVE mode (catchupMs === 0): the −15m / −5m / −1m chips set
 *     catchupMs to (now − N min). The first jump back flips the
 *     channel into catch-up mode (the page rebuilds the player with
 *     the timeshift URL).
 *   - In CATCH-UP mode (catchupMs > 0): the −/+ chips slide the
 *     timestamp around. The big LIVE chip clears catchupMs and the
 *     player is rebuilt with the original live URL.
 *
 * We deliberately use coarse chips (1 / 5 / 15 min) rather than a
 * draggable scrubber: each backward jump on Xtream timeshift is a
 * new HTTP request (the panel re-encodes from its DVR archive), so a
 * scrubber would generate dozens of throwaway requests per drag.
 * Discrete jumps respect the upstream while still giving the user
 * the "step back" behaviour they wanted.
 *
 * Visibility is controlled by the parent — we render the same pill
 * regardless of mode but its layout shifts so the user sees a clear
 * difference: LIVE shows "● LIVE" in red; catch-up shows the offset
 * from now in human form ("−5 min from live") plus the LIVE chip.
 */

import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';

interface Props {
  /** 0 = live, otherwise unix-ms of the catchup start. */
  catchupMs: number;
  /** Latest moment we can rewind to (channel.catchupDays back, or 7 days default). */
  maxRewindDays?: number;
  onSeek:        (newMs: number) => void;
  onReturnLive:  () => void;
  /** Hide when channel doesn't support catch-up. */
  visible?: boolean;
}

const NUDGE_OPTIONS_MIN = [1, 5, 15] as const;

export default function LiveScrubber({
  catchupMs,
  maxRewindDays = 7,
  onSeek,
  onReturnLive,
  visible = true,
}: Props) {
  const { t } = useT();
  // Re-render every 15 s so "−5 min from live" stays accurate without
  // user input. 15 s feels live without thrashing the DOM.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  if (!visible) return null;

  const isLive = catchupMs === 0;
  const now    = Date.now();
  const earliestAllowed = now - maxRewindDays * 86_400_000;
  // For the "− N min from live" label we use the current second so
  // the label looks crisp even right after a click.
  const offsetMin = isLive ? 0 : Math.max(0, Math.round((now - catchupMs) / 60_000));

  function rewind(byMin: number) {
    const baseline = isLive ? now : catchupMs;
    const target   = Math.max(earliestAllowed, baseline - byMin * 60_000);
    onSeek(target);
  }
  function forward(byMin: number) {
    if (isLive) return;        // can't go forward of live
    const target = catchupMs + byMin * 60_000;
    if (target >= now - 30_000) onReturnLive();
    else                        onSeek(target);
  }

  return (
    <div className="live-scrubber" role="group" aria-label={t('live.scrubber.label')}>
      <div className="live-scrubber-row">
        {/* Rewind chips */}
        {NUDGE_OPTIONS_MIN.slice().reverse().map((min) => (
          <button
            key={`back-${min}`}
            type="button"
            className="live-scrubber-chip"
            onClick={() => rewind(min)}
            title={t('live.scrubber.back').replace('{n}', String(min))}
            aria-label={t('live.scrubber.back').replace('{n}', String(min))}
          >
            <span aria-hidden>«</span>
            <span>−{min}m</span>
          </button>
        ))}

        {/* Status / Live button. In LIVE the chip is a non-interactive
            badge showing "● LIVE". In catch-up it becomes the
            primary action that jumps back to the live edge. */}
        {isLive ? (
          <div className="live-scrubber-status live-scrubber-status-live" aria-live="polite">
            <span className="live-scrubber-dot" aria-hidden />
            <span>{t('live.scrubber.live')}</span>
          </div>
        ) : (
          <button
            type="button"
            className="live-scrubber-live-btn"
            onClick={onReturnLive}
            title={t('live.scrubber.returnLive')}
          >
            <span className="live-scrubber-dot" aria-hidden />
            <span>{t('live.scrubber.returnLive')}</span>
          </button>
        )}

        {/* Forward chips — disabled in live mode since "forward of
            now" doesn't exist. We keep them rendered so the layout
            doesn't shift when the user enters / exits catchup. */}
        {NUDGE_OPTIONS_MIN.map((min) => (
          <button
            key={`fwd-${min}`}
            type="button"
            className="live-scrubber-chip"
            onClick={() => forward(min)}
            disabled={isLive}
            title={t('live.scrubber.forward').replace('{n}', String(min))}
            aria-label={t('live.scrubber.forward').replace('{n}', String(min))}
          >
            <span>+{min}m</span>
            <span aria-hidden>»</span>
          </button>
        ))}
      </div>

      {!isLive && (
        <div className="live-scrubber-offset" aria-live="polite">
          {t('live.scrubber.offset').replace('{n}', String(offsetMin))}
        </div>
      )}
    </div>
  );
}
