// Playback preferences.
//
// Previous version showed 14 toggles and 5 selects covering features
// that don't exist in the player:
//   * "Skip intros automatically — audio fingerprint detection"
//   * "Resume across devices — real-time CRDT sync"
//   * "HDR auto-detect", "Volume normalisation across channels"
//   * "Auto-play next episode"  (we don't have a series concept)
//   * Maximum quality / cellular cap selects (the player doesn't
//     read these — adaptive bitrate is left to hls.js)
//   * Preferred audio / subtitle language selects (the manifest
//     parser doesn't honour these)
//
// Every one of them used <Toggle> without a persistKey, so flipping
// them stored nothing and changed nothing. Keeping them was
// actively misleading — a user toggling "Skip intros" expects intros
// to be skipped.
//
// Pass keeps only the two preferences the rest of the codebase
// actually reads:
//   * prefs.prefetchNeighbours  — LivePreviewTile pre-warms ±1 channel
//   * prefs.spoilerProtection   — EPG strip hides scores when on
//
// Subtitle styling stays because SubtitleControls writes its own
// localStorage keys and the player picks them up. Everything else is
// either gone or framed as a roadmap item.

import Link from 'next/link';
import Shell from '../Shell';
import Toggle from '@/components/ui/Toggle';
import SubtitleControls from '@/components/ui/SubtitleControls';

const ROADMAP = [
  'Preferred audio / subtitle language',
  'Adaptive-bitrate cap (data saver)',
  'Auto-play next episode',
  'Resume across devices (cloud progress sync)',
  'HDR auto-detection',
  'Audio normalisation between channels',
];

export default function Preferences() {
  return (
    <Shell active="preferences">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Playback</div>
        <h1 className="ac-panel-title">How you watch</h1>
        <p className="ac-panel-sub">
          Settings that actually affect the player. We don&apos;t list
          toggles for features that aren&apos;t wired up yet — the roadmap
          card at the bottom names what&apos;s coming.
        </p>
      </header>

      <div className="ac-card">
        <div className="ac-card-title">Live TV</div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Pre-warm neighbouring channels</div>
            <div className="ac-toggle-desc">
              Loads the manifest for the channel above and below the current
              one so zapping with the remote feels instant. Uses a little
              extra bandwidth.
            </div>
          </div>
          <Toggle persistKey="prefs.prefetchNeighbours" initialOn />
        </div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Spoiler protection for sport</div>
            <div className="ac-toggle-desc">
              Hides live scores and result-bearing programme titles in the
              channel rail and EPG until you actually open the channel.
            </div>
          </div>
          <Toggle persistKey="prefs.spoilerProtection" />
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Subtitle look</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, marginTop: 0 }}>
          Font, size, colour and background applied to every subtitle track,
          on every device you sign in to.
        </p>
        <SubtitleControls />
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Streaming mode</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, margin: '0 0 6px' }}>
          Choose whether the player fetches video segments directly from
          your provider&apos;s CDN or routes them through our proxy. The
          control lives next to your playlists on the{' '}
          <Link href="/tv/account/sources" className="ac-auth-link">Sources</Link>{' '}
          page so the choice is right next to the M3U it applies to.
        </p>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">On the roadmap</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 13.5, margin: '0 0 12px' }}>
          Features we plan to add to this screen once they exist in the
          player. Until then we don&apos;t put a switch here that does
          nothing.
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: 'var(--ns-text-muted)', lineHeight: 1.8 }}>
          {ROADMAP.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </div>
    </Shell>
  );
}
