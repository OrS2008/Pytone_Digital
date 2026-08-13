// Playback preferences.
//
// Every control on this screen actually drives the player. New
// settings here also need a matching read site somewhere downstream
// (PlayerSurface for hls.js bindings, etc.) — otherwise they belong in
// the roadmap card.
//
// Today's working set:
//   * prefs.prefetchNeighbours  — LivePreviewTile pre-warms ±1 channel
//   * prefs.spoilerProtection   — EPG hides scores when on
//   * prefs.audioLang           — hls.js preferred audio track
//   * prefs.subtitleLang        — hls.js preferred subtitle track
//   * prefs.maxQuality          — hls.js capLevelToPlayerSize + maxAutoLevel
//
// Subtitle styling lives in SubtitleControls (its own localStorage
// keys read by the player).

'use client';

import Link from 'next/link';
import Shell from '../Shell';
import Toggle from '@/components/ui/Toggle';
import SubtitleControls from '@/components/ui/SubtitleControls';
import usePersisted from '@/lib/usePersisted';

const ROADMAP = [
  'Auto-play next episode (waiting on episode metadata in M3U)',
];

// Common ISO-639-1 languages first, plus "off" for subtitles. The
// player matches the M3U manifest's audio / subtitle track names
// against this code; if no match we fall through to whatever the
// stream defaults to.
const AUDIO_LANGS = [
  { value: '', label: 'Auto (stream default)' },
  { value: 'en', label: 'English' },
  { value: 'he', label: 'Hebrew · עברית' },
  { value: 'ar', label: 'Arabic · العربية' },
  { value: 'ru', label: 'Russian · Русский' },
  { value: 'fr', label: 'French · Français' },
  { value: 'es', label: 'Spanish · Español' },
  { value: 'de', label: 'German · Deutsch' },
  { value: 'it', label: 'Italian · Italiano' },
  { value: 'pt', label: 'Portuguese · Português' },
  { value: 'tr', label: 'Turkish · Türkçe' },
];
const SUBTITLE_LANGS = [
  { value: 'off', label: 'Off' },
  { value: '',    label: 'Auto (match audio)' },
  { value: 'en', label: 'English' },
  { value: 'he', label: 'Hebrew · עברית' },
  { value: 'ar', label: 'Arabic · العربية' },
  { value: 'ru', label: 'Russian · Русский' },
  { value: 'fr', label: 'French · Français' },
  { value: 'es', label: 'Spanish · Español' },
];
const QUALITY_OPTIONS = [
  { value: 'auto',   label: 'Auto (adaptive)' },
  { value: '1080',   label: '1080p — high bandwidth' },
  { value: '720',    label: '720p — balanced' },
  { value: '480',    label: '480p — data saver' },
  { value: 'audio',  label: 'Audio only — cellular fallback' },
];

export default function Preferences() {
  const [audioLang,    setAudioLang]    = usePersisted<string>('prefs.audioLang',    '');
  const [subtitleLang, setSubtitleLang] = usePersisted<string>('prefs.subtitleLang', 'off');
  const [maxQuality,   setMaxQuality]   = usePersisted<string>('prefs.maxQuality',   'auto');

  return (
    <Shell active="preferences">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Playback</div>
        <h1 className="ac-panel-title">How you watch</h1>
        <p className="ac-panel-sub">
          Settings that actually affect the player. Every control on this
          screen is read by the live / catch-up player at the next channel
          tune.
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
            <div className="ac-toggle-title">Hide channels that don&apos;t play</div>
            <div className="ac-toggle-desc">
              After a channel fails to start three separate times it is
              hidden from the channel list. Nothing is deleted: the live
              screen shows how many are hidden, rechecks them in the
              background, and puts any that start working again straight
              back. Turn this off to always see every channel in your
              playlist.
            </div>
          </div>
          <Toggle persistKey="prefs.autoHideDead" initialOn />
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
        <div className="ac-card-title">Languages</div>
        <div className="ac-field">
          <label className="ac-field-label">Preferred audio language</label>
          <select
            className="ac-input"
            value={audioLang}
            onChange={(e) => setAudioLang(e.target.value)}
          >
            {AUDIO_LANGS.map((o) => <option key={o.value || 'auto'} value={o.value}>{o.label}</option>)}
          </select>
          <div className="ac-field-help">
            Used when a stream carries multiple audio tracks (e.g. English &amp;
            Hebrew on the same channel). Auto means &quot;whatever the manifest
            picks first&quot;.
          </div>
        </div>
        <div className="ac-field">
          <label className="ac-field-label">Subtitle language</label>
          <select
            className="ac-input"
            value={subtitleLang}
            onChange={(e) => setSubtitleLang(e.target.value)}
          >
            {SUBTITLE_LANGS.map((o) => <option key={o.value || 'auto'} value={o.value}>{o.label}</option>)}
          </select>
          <div className="ac-field-help">
            Only applied when the stream actually carries that subtitle
            track — most live channels don&apos;t.
          </div>
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Bandwidth</div>
        <div className="ac-field">
          <label className="ac-field-label">Maximum quality</label>
          <select
            className="ac-input"
            value={maxQuality}
            onChange={(e) => setMaxQuality(e.target.value)}
          >
            {QUALITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div className="ac-field-help">
            Caps the bitrate hls.js is allowed to climb to. Useful on mobile
            data, weak Wi-Fi, or when sharing the line with other devices.
          </div>
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
