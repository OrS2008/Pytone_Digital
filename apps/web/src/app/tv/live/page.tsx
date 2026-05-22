'use client';

/*
 * Live TV — the channel-list-first IPTV experience.
 *
 * This is the screen IPTV users actually live in (HOT / YES / FreeTV
 * style): a sticky left rail with the channel list (logo · number · name ·
 * now/next), a player taking the rest of the screen, and a "info bar" that
 * surfaces at the bottom on channel change or info-key press, with:
 *
 *   - channel number + logo + name
 *   - current programme title + start–stop time + progress bar
 *   - the next two programmes
 *   - "Restart from beginning" button (uses catch-up)
 *   - "Record" button (one-tap to schedule)
 *   - "More info" button (opens the programme card)
 *
 * Remote behaviour mirrors HOT/YES/FreeTV:
 *   - Up/Down on channel list moves the highlighted channel.
 *   - OK on a channel switches the player to it AND surfaces the info bar.
 *   - Info button toggles the bar.
 *   - Channel up/down on the remote (CHANNEL_+/-, mapped to PageUp/Down)
 *     zaps without opening the list.
 *   - Number keys 0-9 compose a channel-number jump (200ms idle commits).
 *
 * For the dev preview the player is a static placeholder block; the real
 * client wires the playback ticket flow from libs/proto/playback.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import TvNav from '@/components/tv/TvNav';
import { TvFocusProvider } from '@/components/tv/TvFocus';
import ChannelRail from '@/components/tv/live/ChannelRail';
import PlayerSurface from '@/components/tv/live/PlayerSurface';
import InfoBar from '@/components/tv/live/InfoBar';
import NumberZap from '@/components/tv/live/NumberZap';
import { MOCK_CHANNELS } from '@/components/tv/live/mockChannels';
import './live.css';

export default function LivePage() {
  const channels = MOCK_CHANNELS;
  const [activeIdx, setActiveIdx] = useState(0);
  // Show the info banner for 5 seconds on entry and on every channel
  // change, then hide it. Matches HOT / YES / Sting behaviour — the
  // playback surface should be unobstructed during normal viewing.
  const [infoVisible, setInfoVisible] = useState(true);

  const active = channels[activeIdx];

  useEffect(() => {
    if (!infoVisible) return;
    const t = setTimeout(() => setInfoVisible(false), 5000);
    return () => clearTimeout(t);
  }, [infoVisible, activeIdx]);

  const tune = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= channels.length) return;
      setActiveIdx(idx);
      setInfoVisible(true);
    },
    [channels.length],
  );

  // Channel zap (PageUp / PageDown / Channel+ / Channel-).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'PageUp')   tune(activeIdx - 1);
      if (e.key === 'PageDown') tune(activeIdx + 1);
      if (e.key === 'i' || e.key === 'Info') setInfoVisible((v) => !v);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIdx, tune]);

  const tuneByNumber = useCallback(
    (num: number) => {
      const i = channels.findIndex((c) => c.number === num);
      if (i >= 0) tune(i);
    },
    [channels, tune],
  );

  const layout = useMemo(() => 'live-layout', []);
  return (
    <TvFocusProvider>
      <div className={layout}>
        <TvNav />
        <div className="live-body">
          <ChannelRail
            channels={channels}
            activeIdx={activeIdx}
            onTune={tune}
          />
          <PlayerSurface channel={active} />
        </div>
        <InfoBar
          channel={active}
          visible={infoVisible}
          onDismiss={() => setInfoVisible(false)}
          onTune={tune}
          activeIdx={activeIdx}
          channels={channels}
        />
        <NumberZap onCommit={tuneByNumber} />
      </div>
    </TvFocusProvider>
  );
}
