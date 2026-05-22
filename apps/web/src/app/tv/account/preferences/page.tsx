// Playback preferences — audio + subtitle defaults, autoplay, quality cap,
// data saver. Lives separately from /appearance because these are
// behavioural rather than visual.
import Shell from '../Shell';
import Toggle from '@/components/ui/Toggle';

export default function Preferences() {
  return (
    <Shell active="preferences">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Playback</div>
        <h1 className="ac-panel-title">How you watch</h1>
        <p className="ac-panel-sub">
          Defaults applied to every new stream. You can override per-stream from the player.
        </p>
      </header>

      <div className="ac-card">
        <div className="ac-card-title">Languages</div>
        <div className="ac-toggle-row">
          <div style={{ minWidth: 240 }}>
            <div className="ac-toggle-title">Preferred audio language</div>
            <div className="ac-toggle-desc">First match wins. Falls back to the stream's default if no match.</div>
          </div>
          <select className="ac-input" style={{ width: 280 }} defaultValue="Hebrew (עברית)">
            <option>Hebrew (עברית)</option>
            <option>English</option>
            <option>Arabic (العربية)</option>
            <option>Russian (Русский)</option>
          </select>
        </div>
        <div className="ac-toggle-row">
          <div style={{ minWidth: 240 }}>
            <div className="ac-toggle-title">Preferred subtitle language</div>
            <div className="ac-toggle-desc">Auto-enabled when the audio is not in your preferred language.</div>
          </div>
          <select className="ac-input" style={{ width: 280 }} defaultValue="Hebrew (עברית)">
            <option>Hebrew (עברית)</option>
            <option>English</option>
            <option>Off</option>
          </select>
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Auto-play & continuity</div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Auto-play next episode</div>
            <div className="ac-toggle-desc">Series jump to the next episode with a 10-second skip-bar overlay.</div>
          </div>
          <Toggle initialOn />
        </div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Skip intros automatically</div>
            <div className="ac-toggle-desc">Uses audio-fingerprint detection to fast-forward through opening sequences.</div>
          </div>
          <Toggle initialOn />
        </div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Resume where I left off across devices</div>
            <div className="ac-toggle-desc">Watching on the TV, finishing on the phone. Real-time CRDT sync.</div>
          </div>
          <Toggle initialOn />
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Picture & sound</div>
        <div className="ac-toggle-row">
          <div style={{ minWidth: 240 }}>
            <div className="ac-toggle-title">Maximum quality</div>
            <div className="ac-toggle-desc">Caps the adaptive bitrate. Use to save bandwidth or force 4K.</div>
          </div>
          <select className="ac-input" style={{ width: 220 }} defaultValue="Auto (recommended)">
            <option>Auto (recommended)</option>
            <option>4K · UHD when available</option>
            <option>Full HD · 1080p</option>
            <option>HD · 720p</option>
            <option>SD · 480p (data saver)</option>
          </select>
        </div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">HDR auto-detect</div>
            <div className="ac-toggle-desc">Switch to HDR10 / Dolby Vision when the display + content support it.</div>
          </div>
          <Toggle initialOn />
        </div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Volume normalisation across channels</div>
            <div className="ac-toggle-desc">Levels loud / quiet channels so zapping doesn't blast your speakers.</div>
          </div>
          <Toggle initialOn />
        </div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Predictive channel prefetch</div>
            <div className="ac-toggle-desc">Pre-warms the next/previous channel for sub-500ms switching. Uses extra bandwidth.</div>
          </div>
          <Toggle initialOn />
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Mobile data</div>
        <div className="ac-toggle-row">
          <div style={{ minWidth: 240 }}>
            <div className="ac-toggle-title">On cellular, cap quality at</div>
            <div className="ac-toggle-desc">Saves your data plan when you're not on Wi-Fi.</div>
          </div>
          <select className="ac-input" style={{ width: 220 }} defaultValue="720p">
            <option>720p</option>
            <option>480p</option>
            <option>Auto (no cap)</option>
            <option>Block playback on cellular</option>
          </select>
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Sports &amp; live events</div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Spoiler protection</div>
            <div className="ac-toggle-desc">Hide live scores and result-bearing programme titles in the channel rail and EPG until you actually open the channel.</div>
          </div>
          <Toggle persistKey="prefs.spoilerProtection" />
        </div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Pre-warm the next channel</div>
            <div className="ac-toggle-desc">Loads the manifest for the channel above and below the current one so zapping feels instant. Uses a little extra bandwidth.</div>
          </div>
          <Toggle persistKey="prefs.prefetchNeighbours" initialOn />
        </div>
      </div>
    </Shell>
  );
}
