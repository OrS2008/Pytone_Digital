// Sources — where the user adds M3U / Xtream playlists, XMLTV EPG sources,
// and VOD libraries (Xtream / Jellyfin / Plex / SMB / NFS). Three tabs.
// Each list maps to playlist-ingestion sources in the backend.
import Shell from '../Shell';

export default function Sources() {
  return (
    <Shell active="sources">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Sources</div>
        <h1 className="ac-panel-title">Playlists, EPG & VOD</h1>
        <p className="ac-panel-sub">
          Connect your IPTV provider. We support standard M3U / M3U8 playlists, the Xtream
          Codes API, Stalker portals, XMLTV EPG, and VOD libraries from Jellyfin / Plex /
          your own NAS.
        </p>
      </header>

      <div className="ac-source-tabs">
        <button className="ac-source-tab ac-source-tab-active">Live channels · M3U / Xtream</button>
        <button className="ac-source-tab">EPG · XMLTV</button>
        <button className="ac-source-tab">VOD · Movies & Series</button>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Active live-TV sources · 1</div>

        <div className="ac-source">
          <div className="ac-source-icon">M3U</div>
          <div className="ac-source-meta">
            <div className="ac-source-title">My provider</div>
            <div className="ac-source-url">http://provider.example/get.php?username=••••&password=••••&type=m3u_plus</div>
          </div>
          <div className="ac-source-stats">
            <div><span className="ac-source-stat-num">237</span> channels</div>
            <div>refreshed 4h ago</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ac-btn ac-btn-sm">Refresh</button>
            <button className="ac-btn ac-btn-sm ac-btn-danger">Remove</button>
          </div>
        </div>

        <div style={{ marginTop: 20, paddingTop: 24, borderTop: '1px dashed var(--ns-border)' }}>
          <div className="ac-card-title" style={{ marginBottom: 12 }}>Add a new source</div>

          <div className="ac-source-tabs" style={{ marginBottom: 18 }}>
            <button className="ac-source-tab ac-source-tab-active">M3U URL</button>
            <button className="ac-source-tab">Xtream Codes</button>
            <button className="ac-source-tab">Stalker portal</button>
            <button className="ac-source-tab">Upload .m3u</button>
          </div>

          <div className="ac-field">
            <label className="ac-field-label">Friendly name</label>
            <input className="ac-input" placeholder="e.g. My provider" />
          </div>
          <div className="ac-field">
            <label className="ac-field-label">M3U URL</label>
            <input className="ac-input" placeholder="https://your-provider.tv/get.php?username=...&password=..." />
            <div className="ac-field-help">
              We fetch this URL on a schedule (every 6 hours by default) and never share it. Credentials in
              the URL are encrypted at rest with your account key.
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="ac-field">
              <label className="ac-field-label">Auto-refresh</label>
              <select className="ac-input">
                <option>Every 6 hours (recommended)</option>
                <option>Every 12 hours</option>
                <option>Once a day</option>
                <option>Manual only</option>
              </select>
            </div>
            <div className="ac-field">
              <label className="ac-field-label">User-Agent (optional)</label>
              <input className="ac-input" placeholder="Default: Nova Stream / 1.0" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button className="ac-btn ac-btn-primary">Add &amp; ingest</button>
            <button className="ac-btn ac-btn-ghost">Test URL only</button>
          </div>
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">EPG sources · 1</div>
        <div className="ac-source">
          <div className="ac-source-icon" style={{ background: 'rgba(125,249,198,0.10)', color: 'var(--ns-ok)' }}>XML</div>
          <div className="ac-source-meta">
            <div className="ac-source-title">Auto-EPG · IL feed</div>
            <div className="ac-source-url">https://epg.iptvx.one/IL.xml.gz</div>
          </div>
          <div className="ac-source-stats">
            <div><span className="ac-source-stat-num">231</span> / 237 matched</div>
            <div>refreshed 4h ago</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ac-btn ac-btn-sm">Refresh</button>
            <button className="ac-btn ac-btn-sm ac-btn-danger">Remove</button>
          </div>
        </div>
        <div className="ac-add-source" style={{ marginTop: 18 }}>
          <input className="ac-input" placeholder="XMLTV URL (https://...)" />
          <select className="ac-input">
            <option>Auto-merge with existing</option>
            <option>Replace existing</option>
            <option>Add as separate</option>
          </select>
          <button className="ac-btn ac-btn-primary">Add EPG</button>
        </div>
        <div className="ac-field-help" style={{ marginTop: 8 }}>
          We auto-match XMLTV channels to your M3U by tvg-id, then by name with fuzzy matching.
          If 6 channels are unmatched, you can re-map them manually below.
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">VOD libraries · 1</div>
        <div className="ac-source">
          <div className="ac-source-icon" style={{ background: 'rgba(139,92,246,0.14)', color: 'var(--ns-accent-2)' }}>VOD</div>
          <div className="ac-source-meta">
            <div className="ac-source-title">Xtream VOD · provider.example</div>
            <div className="ac-source-url">14,210 movies · 2,890 series · last sync 4h ago</div>
          </div>
          <div className="ac-source-stats">
            <div><span className="ac-source-stat-num">17,100</span> titles</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ac-btn ac-btn-sm">Refresh</button>
            <button className="ac-btn ac-btn-sm ac-btn-danger">Remove</button>
          </div>
        </div>

        <div className="ac-source-tabs" style={{ marginTop: 20 }}>
          <button className="ac-source-tab ac-source-tab-active">Xtream Codes VOD</button>
          <button className="ac-source-tab">Jellyfin server</button>
          <button className="ac-source-tab">Plex server</button>
          <button className="ac-source-tab">SMB / NFS share</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 18 }}>
          <div className="ac-field"><label className="ac-field-label">Host</label><input className="ac-input" placeholder="https://provider.tv" /></div>
          <div className="ac-field"><label className="ac-field-label">Username</label><input className="ac-input" /></div>
          <div className="ac-field"><label className="ac-field-label">Password</label><input className="ac-input" type="password" /></div>
        </div>
        <button className="ac-btn ac-btn-primary">Connect VOD library</button>
      </div>
    </Shell>
  );
}
