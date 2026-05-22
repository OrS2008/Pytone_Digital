// Sources — where the user adds M3U / Xtream playlists, XMLTV EPG sources,
// and VOD libraries (Xtream / Jellyfin / Plex / SMB / NFS). Three tabs.
// Each list maps to playlist-ingestion sources in the backend.
'use client';

import { useState } from 'react';
import Shell from '../Shell';
import ActionButton from '@/components/ui/ActionButton';

type Tab = 'live' | 'epg' | 'vod';
type AddTab = 'm3u' | 'xtream' | 'stalker' | 'upload';

interface Source { id: string; kind: 'M3U' | 'XML' | 'VOD'; title: string; sub: string; stat: string; }

const INITIAL_LIVE: Source[] = [{
  id: 'live-1', kind: 'M3U',
  title: 'My provider',
  sub:   'http://provider.example/get.php?username=••••&password=••••&type=m3u_plus',
  stat:  '237 channels · refreshed 4h ago',
}];
const INITIAL_EPG: Source[] = [{
  id: 'epg-1', kind: 'XML',
  title: 'Auto-EPG · IL feed',
  sub:   'https://epg.iptvx.one/IL.xml.gz',
  stat:  '231 / 237 matched · refreshed 4h ago',
}];
const INITIAL_VOD: Source[] = [{
  id: 'vod-1', kind: 'VOD',
  title: 'Xtream VOD · provider.example',
  sub:   '14,210 movies · 2,890 series · last sync 4h ago',
  stat:  '17,100 titles',
}];

export default function Sources() {
  const [tab,      setTab]      = useState<Tab>('live');
  const [addTab,   setAddTab]   = useState<AddTab>('m3u');
  const [name,     setName]     = useState('');
  const [url,      setUrl]      = useState('');
  const [live,     setLive]     = useState(INITIAL_LIVE);
  const [epg,      setEpg]      = useState(INITIAL_EPG);
  const [vod,      setVod]      = useState(INITIAL_VOD);
  const [epgUrl,   setEpgUrl]   = useState('');
  const [vodHost,  setVodHost]  = useState('');
  const [vodUser,  setVodUser]  = useState('');
  const [vodPass,  setVodPass]  = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  function flash(text: string) {
    setFeedback(text);
    setTimeout(() => setFeedback(null), 2200);
  }

  function addLive() {
    if (!url.startsWith('http')) return flash('M3U URL must start with http:// or https://');
    const friendly = name.trim() || new URL(url).hostname;
    setLive([...live, {
      id: 'live-' + Date.now(), kind: 'M3U',
      title: friendly, sub: url, stat: 'queued for ingestion',
    }]);
    setName(''); setUrl('');
    flash(`Added "${friendly}" — ingestion queued.`);
  }
  function addEpg() {
    if (!epgUrl.startsWith('http')) return flash('XMLTV URL must start with http:// or https://');
    setEpg([...epg, {
      id: 'epg-' + Date.now(), kind: 'XML',
      title: 'Custom EPG feed', sub: epgUrl, stat: 'queued for matching',
    }]);
    setEpgUrl('');
    flash('EPG feed queued.');
  }
  function addVod() {
    if (!vodHost.startsWith('http')) return flash('Host must start with http:// or https://');
    setVod([...vod, {
      id: 'vod-' + Date.now(), kind: 'VOD',
      title: 'Custom VOD · ' + new URL(vodHost).hostname,
      sub: 'queued for first sync',
      stat: '—',
    }]);
    setVodHost(''); setVodUser(''); setVodPass('');
    flash('VOD library connected — first sync queued.');
  }
  const removeFrom = (list: Source[], setList: (s: Source[]) => void) => (id: string) => {
    setList(list.filter((s) => s.id !== id));
    flash('Source removed.');
  };

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
        <button onClick={() => setTab('live')} className={`ac-source-tab ${tab==='live' ? 'ac-source-tab-active':''}`}>Live channels · M3U / Xtream</button>
        <button onClick={() => setTab('epg')}  className={`ac-source-tab ${tab==='epg'  ? 'ac-source-tab-active':''}`}>EPG · XMLTV</button>
        <button onClick={() => setTab('vod')}  className={`ac-source-tab ${tab==='vod'  ? 'ac-source-tab-active':''}`}>VOD · Movies & Series</button>
      </div>

      {feedback && (
        <div style={{
          padding: '10px 14px', marginBottom: 14, borderRadius: 10,
          background: 'var(--ns-accent-soft)', color: 'var(--ns-accent)',
          fontSize: 13, fontWeight: 600,
        }}>{feedback}</div>
      )}

      {tab === 'live' && (
        <div className="ac-card">
          <div className="ac-card-title">Active live-TV sources · {live.length}</div>

          {live.map((s) => (
            <div key={s.id} className="ac-source">
              <div className="ac-source-icon">{s.kind}</div>
              <div className="ac-source-meta">
                <div className="ac-source-title">{s.title}</div>
                <div className="ac-source-url">{s.sub}</div>
              </div>
              <div className="ac-source-stats"><div>{s.stat}</div></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <ActionButton doneLabel="Refreshed ✓">Refresh</ActionButton>
                <button className="ac-btn ac-btn-sm ac-btn-danger" onClick={() => removeFrom(live, setLive)(s.id)}>Remove</button>
              </div>
            </div>
          ))}

          <div style={{ marginTop: 20, paddingTop: 24, borderTop: '1px dashed var(--ns-border)' }}>
            <div className="ac-card-title" style={{ marginBottom: 12 }}>Add a new source</div>

            <div className="ac-source-tabs" style={{ marginBottom: 18 }}>
              {(['m3u', 'xtream', 'stalker', 'upload'] as AddTab[]).map((id) => (
                <button
                  key={id}
                  onClick={() => setAddTab(id)}
                  className={`ac-source-tab ${addTab === id ? 'ac-source-tab-active' : ''}`}
                >
                  {id === 'm3u' ? 'M3U URL' : id === 'xtream' ? 'Xtream Codes' : id === 'stalker' ? 'Stalker portal' : 'Upload .m3u'}
                </button>
              ))}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); addLive(); }}>
              <div className="ac-field">
                <label className="ac-field-label">Friendly name</label>
                <input className="ac-input" placeholder="e.g. My provider" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="ac-field">
                <label className="ac-field-label">{addTab === 'upload' ? 'Upload file' : 'M3U URL'}</label>
                {addTab === 'upload'
                  ? <input className="ac-input" type="file" accept=".m3u,.m3u8" onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) { setUrl(`file://${f.name}`); setName(name || f.name.replace(/\.m3u8?$/i, '')); }
                    }} />
                  : <input className="ac-input" placeholder="https://your-provider.tv/get.php?username=...&password=..." value={url} onChange={(e) => setUrl(e.target.value)} />
                }
                <div className="ac-field-help">
                  We fetch this URL on a schedule (every 6 hours by default) and never share it. Credentials in
                  the URL are encrypted at rest with your account key.
                </div>
              </div>
              <div className="ac-source-add-grid">
                <div className="ac-field">
                  <label className="ac-field-label">Auto-refresh</label>
                  <select className="ac-input" defaultValue="Every 6 hours (recommended)">
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
              <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                <button type="submit" className="ac-btn ac-btn-primary">Add &amp; ingest</button>
                <ActionButton className="ac-btn ac-btn-ghost" doneLabel="URL reachable ✓">Test URL only</ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {tab === 'epg' && (
        <div className="ac-card">
          <div className="ac-card-title">EPG sources · {epg.length}</div>
          {epg.map((s) => (
            <div key={s.id} className="ac-source">
              <div className="ac-source-icon" style={{ background: 'rgba(125,249,198,0.10)', color: 'var(--ns-ok)' }}>{s.kind}</div>
              <div className="ac-source-meta">
                <div className="ac-source-title">{s.title}</div>
                <div className="ac-source-url">{s.sub}</div>
              </div>
              <div className="ac-source-stats"><div>{s.stat}</div></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <ActionButton doneLabel="Refreshed ✓">Refresh</ActionButton>
                <button className="ac-btn ac-btn-sm ac-btn-danger" onClick={() => removeFrom(epg, setEpg)(s.id)}>Remove</button>
              </div>
            </div>
          ))}
          <form className="ac-add-source" style={{ marginTop: 18 }} onSubmit={(e) => { e.preventDefault(); addEpg(); }}>
            <input className="ac-input" placeholder="XMLTV URL (https://...)" value={epgUrl} onChange={(e) => setEpgUrl(e.target.value)} />
            <select className="ac-input" defaultValue="Auto-merge with existing">
              <option>Auto-merge with existing</option>
              <option>Replace existing</option>
              <option>Add as separate</option>
            </select>
            <button type="submit" className="ac-btn ac-btn-primary">Add EPG</button>
          </form>
          <div className="ac-field-help" style={{ marginTop: 8 }}>
            We auto-match XMLTV channels to your M3U by tvg-id, then by name with fuzzy matching.
            If channels are unmatched you can re-map them manually below.
          </div>
        </div>
      )}

      {tab === 'vod' && (
        <div className="ac-card">
          <div className="ac-card-title">VOD libraries · {vod.length}</div>
          {vod.map((s) => (
            <div key={s.id} className="ac-source">
              <div className="ac-source-icon" style={{ background: 'rgba(139,92,246,0.14)', color: 'var(--ns-accent-2)' }}>{s.kind}</div>
              <div className="ac-source-meta">
                <div className="ac-source-title">{s.title}</div>
                <div className="ac-source-url">{s.sub}</div>
              </div>
              <div className="ac-source-stats"><div>{s.stat}</div></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <ActionButton doneLabel="Sync queued ✓">Refresh</ActionButton>
                <button className="ac-btn ac-btn-sm ac-btn-danger" onClick={() => removeFrom(vod, setVod)(s.id)}>Remove</button>
              </div>
            </div>
          ))}

          <form onSubmit={(e) => { e.preventDefault(); addVod(); }}>
            <div className="ac-source-tabs" style={{ marginTop: 20 }}>
              <button type="button" className="ac-source-tab ac-source-tab-active">Xtream Codes VOD</button>
              <button type="button" className="ac-source-tab">Jellyfin server</button>
              <button type="button" className="ac-source-tab">Plex server</button>
              <button type="button" className="ac-source-tab">SMB / NFS share</button>
            </div>
            <div className="ac-vod-add-grid">
              <div className="ac-field"><label className="ac-field-label">Host</label><input className="ac-input" placeholder="https://provider.tv" value={vodHost} onChange={(e) => setVodHost(e.target.value)} /></div>
              <div className="ac-field"><label className="ac-field-label">Username</label><input className="ac-input" value={vodUser} onChange={(e) => setVodUser(e.target.value)} /></div>
              <div className="ac-field"><label className="ac-field-label">Password</label><input className="ac-input" type="password" value={vodPass} onChange={(e) => setVodPass(e.target.value)} /></div>
            </div>
            <button type="submit" className="ac-btn ac-btn-primary">Connect VOD library</button>
          </form>
        </div>
      )}
    </Shell>
  );
}
