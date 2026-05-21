'use client';

import type { Channel } from './types';

/*
 * The player surface. In production this wires the playback ticket flow:
 *
 *   1. POST /api/playback/ticket {channelId} → ticketID + manifestURL
 *   2. attach hls.js / shaka / native <video> as per platform
 *   3. heartbeat every 10s to the gateway (refreshes the device slot)
 *
 * For the dev preview we render a placeholder showing the channel number
 * and the current programme — enough to read the UX, with no live decode.
 */
export default function PlayerSurface({ channel }: { channel?: Channel }) {
  return (
    <div className="player-surface">
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
    </div>
  );
}
