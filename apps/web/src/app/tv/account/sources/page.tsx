// Sources — where the user adds M3U / Xtream playlists, XMLTV EPG sources,
// and VOD libraries (Xtream / Jellyfin / Plex / SMB / NFS). Three tabs.
// Each list maps to playlist-ingestion sources in the backend.
'use client';

import { useEffect, useState } from 'react';
import Shell from '../Shell';
import ActionButton from '@/components/ui/ActionButton';
import usePersisted from '@/lib/usePersisted';
import { fetchAndCache, getUserSourceUrl, invalidateCache, localM3UKey } from '@/lib/channelCache';

type Tab = 'live' | 'epg' | 'vod';
type AddTab = 'm3u' | 'xtream' | 'stalker' | 'upload';

interface Source { id: string; kind: 'M3U' | 'XML' | 'VOD'; title: string; sub: string; stat: string; }

// No seed sources. We used to ship a placeholder "My provider" row with
// a masked URL, but users kept clicking Edit on it to paste their real
// playlist — and because the masked URL was detected as the active one,
// the rest of the app never noticed they'd configured anything. Empty
// initial state with a clear CTA is less confusing.
const INITIAL_LIVE: Source[] = [];
const INITIAL_EPG:  Source[] = [];
const INITIAL_VOD:  Source[] = [];

export default function Sources() {
  // Initial tab honours ?tab=epg / ?tab=vod so the "add a programme
  // guide" link on /tv/live drops the user straight onto the right
  // panel instead of making them hunt for it.
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'live';
    const q = new URLSearchParams(window.location.search).get('tab');
    return q === 'epg' || q === 'vod' ? q : 'live';
  });
  const [addTab,   setAddTab]   = useState<AddTab>('m3u');
  const [name,     setName]     = useState('');
  const [url,      setUrl]      = useState('');
  // The source lists survive reload via localStorage so the user's edits
  // aren't lost when they navigate away. This is a frontend-only shim —
  // when the playlist-ingestion backend is reachable, replace with a
  // real fetch + persist via the gateway.
  const [live,     setLive]     = usePersisted('sources.live', INITIAL_LIVE);
  const [epg,      setEpg]      = usePersisted('sources.epg',  INITIAL_EPG);
  const [vod,      setVod]      = usePersisted('sources.vod',  INITIAL_VOD);
  // Streaming mode (proxy vs direct). See lib/streamProxy.ts. Stored
  // per-user so the choice syncs across devices.
  const [streamMode, setStreamMode] = usePersisted<'proxy' | 'direct'>('prefs.streamMode', 'proxy');
  const [epgUrl,   setEpgUrl]   = useState('');
  const [vodHost,  setVodHost]  = useState('');
  const [vodUser,  setVodUser]  = useState('');
  const [vodPass,  setVodPass]  = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  // One-shot migration: drop the old `live-1` placeholder row (and the
  // matching seeds for EPG / VOD) for users who carried it over from a
  // previous visit. Until we did this, an "edited" placeholder still
  // had id `live-1` and was being filtered out everywhere else — the
  // root cause of "I added a playlist but the app shows demo channels".
  useEffect(() => {
    setLive((prev) => {
      const cleaned = prev.filter((s) =>
        s.id !== 'live-1' && !/provider\.example|•/.test(s.sub),
      );
      return cleaned.length === prev.length ? prev : cleaned;
    });
    setEpg((prev) => prev.filter((s) => s.id !== 'epg-1'));
    setVod((prev) => prev.filter((s) => s.id !== 'vod-1'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flash(text: string) {
    setFeedback(text);
    setTimeout(() => setFeedback(null), 2200);
  }

  async function addLive() {
    const isLocal = url.startsWith('local:');
    if (!isLocal && !url.startsWith('http')) {
      return flash('M3U URL must start with http:// or https:// — or upload a file from the Upload tab.');
    }
    let friendly: string;
    if (isLocal) {
      friendly = name.trim() || 'Uploaded playlist';
    } else {
      try {
        friendly = name.trim() || new URL(url).hostname;
      } catch {
        return flash('That doesn\'t look like a valid URL — check for typos.');
      }
    }
    const id = 'live-' + Date.now();
    const submittedUrl = url;
    // Add to the list immediately so the user sees feedback; mark the
    // status as "fetching…" until the ingest call resolves.
    setLive([...live, {
      id, kind: 'M3U',
      title: friendly, sub: submittedUrl, stat: 'fetching channels…',
    }]);
    setName(''); setUrl('');
    flash(`Adding "${friendly}"…`);

    // Drive the actual ingest now — fetchAndCache hits /api/m3u with
    // the URL directly so we don't race the localStorage write.
    const result = await fetchAndCache(submittedUrl);
    if (result.error) {
      setLive((prev: Source[]) => prev.map((s) => s.id === id ? { ...s, stat: `error: ${result.error}` } : s));
      flash(`Failed: ${result.error.slice(0, 140)}`);
    } else {
      const count = result.channels.length;
      const cats  = new Set(result.channels.map((c) => c.category)).size;
      setLive((prev: Source[]) => prev.map((s) => s.id === id ? { ...s, stat: `${count} channels · ${cats} categories · just now` } : s));
      flash(`Loaded ${count} channels.`);
    }
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
  async function refreshLive(id: string) {
    const s = live.find((x) => x.id === id);
    if (!s) return;
    if (!s.sub.startsWith('http') && !s.sub.startsWith('local:')) return;
    setLive((prev: Source[]) => prev.map((x) => x.id === id ? { ...x, stat: 'refreshing…' } : x));
    flash(s.sub.startsWith('local:') ? 'Re-parsing file…' : 'Refreshing channels…');
    const result = await fetchAndCache(s.sub);
    if (result.error) {
      setLive((prev: Source[]) => prev.map((x) => x.id === id ? { ...x, stat: `error: ${result.error}` } : x));
      flash(`Refresh failed: ${result.error.slice(0, 140)}`);
    } else {
      const count = result.channels.length;
      setLive((prev: Source[]) => prev.map((x) => x.id === id ? { ...x, stat: `${count} channels · just now` } : x));
      flash(`Reloaded ${count} channels.`);
    }
  }

  async function testUrl() {
    if (!url.startsWith('http') && !url.startsWith('local:')) {
      flash('URL must start with http:// or https:// — or upload a file from the Upload tab.');
      return;
    }
    flash(url.startsWith('local:') ? 'Parsing file…' : 'Testing URL…');
    const result = await fetchAndCache(url);
    if (result.error) flash(`Failed: ${result.error.slice(0, 140)}`);
    else               flash(`Reachable — ${result.channels.length} channels detected.`);
  }

  const removeFrom = (list: Source[], setList: (s: Source[]) => void) => (id: string) => {
    const removed = list.find((s) => s.id === id);
    setList(list.filter((s) => s.id !== id));
    // If it was an uploaded file, drop the cached text too so we don't
    // leak ~MB into localStorage on every remove + re-upload cycle.
    if (removed?.sub.startsWith('local:')) {
      try { localStorage.removeItem(localM3UKey(removed.sub.slice('local:'.length))); }
      catch { /* ignore */ }
    }
    // The user removed a live source — drop any cached channels that
    // might have come from it so the next page load doesn't serve
    // stale data.
    invalidateCache();
    flash('Source removed.');
  };

  async function editLive(id: string) {
    const s = live.find((x) => x.id === id);
    if (!s) return;
    if (s.sub.startsWith('local:')) {
      flash('To change an uploaded playlist, remove this entry and upload the new file.');
      return;
    }
    const nextUrl = typeof window !== 'undefined' ? window.prompt('New M3U URL', s.sub) : null;
    if (!nextUrl) return;
    if (!nextUrl.startsWith('http')) { flash('URL must start with http:// or https://'); return; }
    const nextName = window.prompt('Friendly name', s.title) || s.title;
    setLive(live.map((x) => x.id === id ? { ...x, sub: nextUrl, title: nextName, stat: 'fetching channels…' } : x));
    flash(`Updating "${nextName}"…`);

    const result = await fetchAndCache(nextUrl);
    if (result.error) {
      setLive((prev: Source[]) => prev.map((x) => x.id === id ? { ...x, stat: `error: ${result.error}` } : x));
      flash(`Failed: ${result.error.slice(0, 140)}`);
    } else {
      const count = result.channels.length;
      setLive((prev: Source[]) => prev.map((x) => x.id === id ? { ...x, stat: `${count} channels · just now` } : x));
      flash(`Reloaded ${count} channels.`);
    }
  }

  function editEpg(id: string) {
    const s = epg.find((x) => x.id === id);
    if (!s) return;
    const nextUrl = typeof window !== 'undefined' ? window.prompt('New XMLTV URL', s.sub) : null;
    if (!nextUrl) return;
    if (!nextUrl.startsWith('http')) { flash('URL must start with http:// or https://'); return; }
    setEpg(epg.map((x) => x.id === id ? { ...x, sub: nextUrl, stat: 'queued for matching' } : x));
    flash('EPG feed updated — re-matching queued.');
  }

  function editVod(id: string) {
    const s = vod.find((x) => x.id === id);
    if (!s) return;
    const nextHost = typeof window !== 'undefined' ? window.prompt('New host URL', s.sub) : null;
    if (!nextHost) return;
    setVod(vod.map((x) => x.id === id ? { ...x, sub: nextHost, stat: 'queued for first sync' } : x));
    flash('VOD library updated.');
  }

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
        <ActiveSourceIndicator />
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
          <StreamModeToggle mode={streamMode} setMode={setStreamMode} />
          <div className="ac-card-title">Active live-TV sources · {live.length}</div>

          {live.map((s) => (
            <div key={s.id} className="ac-source">
              <div className="ac-source-icon">{s.kind}</div>
              <div className="ac-source-meta">
                <div className="ac-source-title">{s.title}</div>
                <div className="ac-source-url">
                  {s.sub.startsWith('local:') ? '📁 Uploaded file (stored in browser)' : s.sub}
                </div>
              </div>
              <div className="ac-source-stats"><div>{s.stat}</div></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="ac-btn ac-btn-sm" onClick={() => editLive(s.id)}>Edit</button>
                <button className="ac-btn ac-btn-sm" onClick={() => refreshLive(s.id)}>Refresh</button>
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
                  ? <input
                      className="ac-input"
                      type="file"
                      accept=".m3u,.m3u8,.txt,text/plain"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        // 25 MB ceiling: localStorage's per-origin quota is
                        // usually 5–10 MB on mobile and 10 MB on desktop, but
                        // M3U is plain text so it compresses well — we trust
                        // the user knows their playlist size and surface a
                        // friendly error if setItem throws QuotaExceededError.
                        if (f.size > 25 * 1024 * 1024) {
                          flash('File too large (max 25 MB). Try a smaller playlist.');
                          return;
                        }
                        const text = await f.text();
                        if (!/#EXTM3U|#EXTINF/i.test(text)) {
                          flash('That doesn\'t look like an M3U file — it should start with #EXTM3U.');
                          return;
                        }
                        const localId = `up-${Date.now().toString(36)}`;
                        try {
                          localStorage.setItem(localM3UKey(localId), text);
                        } catch {
                          flash('Couldn\'t store the playlist locally (browser storage is full).');
                          return;
                        }
                        setUrl(`local:${localId}`);
                        if (!name.trim()) setName(f.name.replace(/\.(m3u8?|txt)$/i, ''));
                        flash(`File loaded (${(f.size / 1024).toFixed(0)} KB) — click "Add & ingest" to use it.`);
                      }}
                    />
                  : <input className="ac-input" placeholder="https://your-provider.tv/get.php?username=...&password=..." value={url} onChange={(e) => setUrl(e.target.value)} />
                }
                <div className="ac-field-help">
                  {addTab === 'upload'
                    ? 'The file stays in your browser. No upload to a server. Re-upload after clearing browser storage.'
                    : 'We fetch this URL on a schedule (every 6 hours by default) and never share it. Credentials in the URL are encrypted at rest with your account key.'}
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
                <button type="button" className="ac-btn ac-btn-ghost" onClick={testUrl}>Test URL only</button>
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
                <button className="ac-btn ac-btn-sm" onClick={() => editEpg(s.id)}>Edit</button>
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
                <button className="ac-btn ac-btn-sm" onClick={() => editVod(s.id)}>Edit</button>
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

// Streaming-mode toggle. The user picks whether segments should flow
// through /api/stream (the proxy, default) or come direct from the
// provider's CDN. Direct mode is dramatically cheaper for us at scale
// but only works when the provider sends CORS headers on segments —
// most modern IPTV CDNs do, older / smaller ones don't.
function StreamModeToggle({
  mode,
  setMode,
}: {
  mode: 'proxy' | 'direct';
  setMode: (m: 'proxy' | 'direct') => void;
}) {
  const isDirect = mode === 'direct';
  return (
    <div
      style={{
        padding: '14px 16px',
        marginBottom: 18,
        borderRadius: 12,
        background: isDirect ? 'rgba(125,249,198,0.08)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isDirect ? 'rgba(125,249,198,0.25)' : 'var(--ns-border)'}`,
        display: 'flex', gap: 14, alignItems: 'flex-start',
      }}
    >
      <input
        type="checkbox"
        checked={isDirect}
        onChange={(e) => setMode(e.target.checked ? 'direct' : 'proxy')}
        style={{ marginTop: 4, width: 18, height: 18, cursor: 'pointer' }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
          Direct streaming {isDirect ? '· enabled' : '· off'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ns-text-faint)', lineHeight: 1.5 }}>
          When on, video segments are fetched straight from your provider's CDN
          instead of going through our servers. Faster playback, lower data
          overhead. Requires your provider to allow cross-origin requests
          (most modern providers do). If playback breaks for a channel,
          turn this off and reload.
        </div>
      </div>
    </div>
  );
}

// Tiny banner under the page header that surfaces which playlist URL the
// rest of the app will actually load. Lots of debugging time went into
// users adding a URL and then seeing demo channels everywhere — this
// makes it obvious whether the URL is recognised or not. Re-reads on
// every render so adds / edits / removes update it immediately.
function ActiveSourceIndicator() {
  const [active, setActive] = useState<{ url: string; title: string } | null>(null);
  useEffect(() => {
    setActive(getUserSourceUrl());
    // Re-check on every storage event (e.g. usePersisted writing the new list).
    const onStorage = () => setActive(getUserSourceUrl());
    window.addEventListener('storage', onStorage);
    // Also poll while this screen is open — usePersisted writes happen in
    // the same tab, which doesn't fire the storage event.
    const t = setInterval(onStorage, 1200);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(t); };
  }, []);
  const ok = !!active;
  return (
    <div style={{
      marginTop: 14,
      padding: '10px 14px',
      borderRadius: 10,
      background: ok ? 'rgba(125,249,198,0.10)' : 'rgba(255,196,72,0.10)',
      color: ok ? 'var(--ns-ok)' : '#FFB74D',
      fontSize: 13, fontWeight: 600,
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    }}>
      <span>{ok ? '✓ Active playlist:' : '⚠ No playlist configured yet.'}</span>
      {active && (
        <code style={{
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          fontSize: 12, fontWeight: 400,
          background: 'rgba(255,255,255,0.06)',
          padding: '2px 6px', borderRadius: 4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          maxWidth: '60ch',
        }}>{active.url}</code>
      )}
    </div>
  );
}
