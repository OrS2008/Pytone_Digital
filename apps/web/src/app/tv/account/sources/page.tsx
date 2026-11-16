// Sources — the user's IPTV connection. Two tabs:
//   * Playlist — the M3U / Xtream URL or uploaded file the live channels
//                + catch-up + guide all read from.
//   * EPG      — the XMLTV URL whose programmes hydrate the guide.
//
// Earlier versions had a third "VOD" tab and a nested "Stalker portal"
// sub-tab — both untruthful (no Stalker handshake; the "VOD" list was a
// stub that didn't power /tv/vod). Trimmed so every field on the page
// drives real behaviour.
'use client';

import { useEffect, useState } from 'react';
import Shell from '../Shell';
import usePersisted from '@/lib/usePersisted';
import { fetchAndCache, getUserSourceUrl, invalidateCache, localM3UKey } from '@/lib/channelCache';
import { useT } from '@/lib/i18n';
import ProviderForm from '@/components/tv/ProviderForm';
import { removeProvider, rememberCaps, type PublicProvider } from '@/lib/providersClient';
import { maskSourceUrl } from '@/lib/maskUrl';

type Tab = 'live' | 'epg';
type AddTab = 'm3u' | 'upload' | 'xtream' | 'stalker';

interface Source { id: string; kind: 'M3U' | 'XML' | 'XC' | 'MAG'; title: string; sub: string; stat: string; }

// No seed sources. We used to ship a placeholder "My provider" row with
// a masked URL, but users kept clicking Edit on it to paste their real
// playlist — and because the masked URL was detected as the active one,
// the rest of the app never noticed they'd configured anything. Empty
// initial state with a clear CTA is less confusing.
const INITIAL_LIVE: Source[] = [];
const INITIAL_EPG:  Source[] = [];

export default function Sources() {
  const { t } = useT();
  // Initial tab honours ?tab=epg so "add a programme guide" links from
  // other screens drop the user straight onto that panel.
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'live';
    const q = new URLSearchParams(window.location.search).get('tab');
    return q === 'epg' ? q : 'live';
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
  // Streaming mode (proxy vs direct). See lib/streamProxy.ts. Stored
  // per-user so the choice syncs across devices.
  const [streamMode, setStreamMode] = usePersisted<'proxy' | 'direct'>('prefs.streamMode', 'proxy');
  const [epgUrl,   setEpgUrl]   = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editing,  setEditing]  = useState<null | { kind: 'live' | 'epg'; id: string; url: string; name: string }>(null);

  // One-shot migration: drop the old `live-1` placeholder row and any
  // legacy VOD entries from before the VOD tab was removed.
  useEffect(() => {
    setLive((prev) => {
      const cleaned = prev.filter((s) =>
        s.id !== 'live-1' && !/provider\.example|•/.test(s.sub),
      );
      return cleaned.length === prev.length ? prev : cleaned;
    });
    setEpg((prev) => prev.filter((s) => s.id !== 'epg-1'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flash(text: string) {
    setFeedback(text);
    setTimeout(() => setFeedback(null), 2200);
  }

  async function addLive() {
    const isLocal = url.startsWith('local:');
    if (!isLocal && !url.startsWith('http')) {
      return flash(t('src.errScheme'));
    }
    let friendly: string;
    if (isLocal) {
      friendly = name.trim() || t('src.uploaded');
    } else {
      try {
        friendly = name.trim() || new URL(url).hostname;
      } catch {
        return flash(t('src.errUrl'));
      }
    }
    const id = 'live-' + Date.now();
    const submittedUrl = url;
    // Add to the list immediately so the user sees feedback; mark the
    // status as "fetching…" until the ingest call resolves.
    setLive([...live, {
      id, kind: 'M3U',
      title: friendly, sub: submittedUrl, stat: t('src.fetching'),
    }]);
    setName(''); setUrl('');
    flash(`${t('src.adding')} "${friendly}"…`);

    // Drive the actual ingest now — fetchAndCache hits /api/m3u with
    // the URL directly so we don't race the localStorage write.
    const result = await fetchAndCache(submittedUrl);
    if (result.error) {
      setLive((prev: Source[]) => prev.map((s) => s.id === id ? { ...s, stat: `${t('src.error')}: ${result.error}` } : s));
      flash(`${t('src.failed')}: ${result.error.slice(0, 140)}`);
    } else {
      const count = result.channels.length;
      const cats  = new Set(result.channels.map((c) => c.category)).size;
      setLive((prev: Source[]) => prev.map((s) => s.id === id ? { ...s, stat: `${count} ${t('src.channels')} · ${cats} ${t('src.categories')} · ${t('src.justNow')}` } : s));
      flash(`${t('src.loaded')} ${count} ${t('src.channels')}.`);
    }
  }
  function addEpg() {
    if (!epgUrl.startsWith('http')) return flash(t('src.errSchemeShort'));
    setEpg([...epg, {
      id: 'epg-' + Date.now(), kind: 'XML',
      title: t('src.customEpg'), sub: epgUrl, stat: t('src.queued'),
    }]);
    setEpgUrl('');
    flash(t('src.epgQueued'));
  }
  async function refreshLive(id: string) {
    const s = live.find((x) => x.id === id);
    if (!s) return;
    if (!s.sub.startsWith('http') && !s.sub.startsWith('local:')) return;
    setLive((prev: Source[]) => prev.map((x) => x.id === id ? { ...x, stat: t('src.refreshing') } : x));
    flash(s.sub.startsWith('local:') ? t('src.reparsing') : t('src.refreshingCh'));
    const result = await fetchAndCache(s.sub);
    if (result.error) {
      setLive((prev: Source[]) => prev.map((x) => x.id === id ? { ...x, stat: `${t('src.error')}: ${result.error}` } : x));
      flash(`${t('src.refreshFailed')}: ${result.error.slice(0, 140)}`);
    } else {
      const count = result.channels.length;
      setLive((prev: Source[]) => prev.map((x) => x.id === id ? { ...x, stat: `${count} ${t('src.channels')} · ${t('src.justNow')}` } : x));
      flash(`${t('src.reloaded')} ${count} ${t('src.channels')}.`);
    }
  }

  async function testUrl() {
    if (!url.startsWith('http') && !url.startsWith('local:')) {
      flash(t('src.errScheme'));
      return;
    }
    flash(url.startsWith('local:') ? t('src.parsing') : t('src.testing'));
    const result = await fetchAndCache(url);
    if (result.error) flash(`${t('src.failed')}: ${result.error.slice(0, 140)}`);
    else               flash(`${t('src.reachable')} ${result.channels.length} ${t('src.detected')}`);
  }

  // A provider connection was verified and stored server-side; reference
  // it from the source list (it becomes the active source) and, when it
  // ships a guide, from the EPG list too.
  function onProviderAdded(p: PublicProvider) {
    const sub = `provider:${p.id}`;
    rememberCaps(p.id, p.capabilities);
    setLive((prev: Source[]) => [...prev.filter((s) => s.sub !== sub), {
      id: `prov-${p.id}`, kind: p.type === 'xtream' ? 'XC' : 'MAG', title: p.name, sub, stat: accountLine(p),
    }]);
    if (p.capabilities.epg) {
      setEpg((prev: Source[]) => [...prev.filter((s) => s.sub !== sub), {
        id: `epg-prov-${p.id}`, kind: 'XML', title: `${p.name} · ${t('prov.guide')}`, sub, stat: '',
      }]);
    }
    invalidateCache();
    flash(`"${p.name}" ${t('prov.added')}`);
  }

  function accountLine(p: PublicProvider): string {
    const a = p.account;
    const exp = a?.expiresAt ? `${t('prov.expires')} ${new Date(a.expiresAt).toLocaleDateString()}` : t('prov.noExpiry');
    const cons = a?.maxConnections ? ` · ${a.activeConnections ?? 0}/${a.maxConnections}` : '';
    return `${p.label} · ${a?.status ?? ''} · ${exp}${cons}`;
  }

  const removeFrom = (list: Source[], setList: (s: Source[]) => void) => (id: string) => {
    const removed = list.find((s) => s.id === id);
    setList(list.filter((s) => s.id !== id));
    // Provider connection: delete the server-side record (and its
    // encrypted credentials) and any guide entry pointing at it.
    if (removed?.sub.startsWith('provider:')) {
      const pid = removed.sub.slice('provider:'.length);
      removeProvider(pid).catch(() => flash(t('src.failed')));
      setEpg((prev: Source[]) => prev.filter((s) => s.sub !== removed.sub));
    }
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
    flash(t('src.removed'));
  };

  // Inline editing. This used to be two window.prompt() calls; inside
  // the Android app the WebView draws that dialog with no visible text
  // field, so there was nowhere to type the new URL.
  function startEdit(kind: 'live' | 'epg', s: Source) {
    if (s.sub.startsWith('local:')) { flash(t('src.editUploaded')); return; }
    if (s.sub.startsWith('provider:')) { flash(t('prov.editProvider')); return; }
    setEditing({ kind, id: s.id, url: s.sub, name: s.title });
  }

  async function saveEdit() {
    if (!editing) return;
    const { kind, id } = editing;
    const nextUrl = editing.url.trim();
    if (!/^https?:\/\//i.test(nextUrl)) { flash(t('src.errSchemeShort')); return; }
    setEditing(null);

    if (kind === 'epg') {
      setEpg(epg.map((x) => x.id === id ? { ...x, sub: nextUrl, stat: t('src.queued') } : x));
      flash(t('src.epgUpdated'));
      return;
    }

    const prevTitle = live.find((x) => x.id === id)?.title ?? '';
    const nextName = editing.name.trim() || prevTitle;
    setLive(live.map((x) => x.id === id ? { ...x, sub: nextUrl, title: nextName, stat: t('src.fetching') } : x));
    flash(`${t('src.updating')} "${nextName}"…`);

    const result = await fetchAndCache(nextUrl);
    if (result.error) {
      setLive((prev: Source[]) => prev.map((x) => x.id === id ? { ...x, stat: `${t('src.error')}: ${result.error}` } : x));
      flash(`${t('src.failed')}: ${result.error.slice(0, 140)}`);
    } else {
      const count = result.channels.length;
      setLive((prev: Source[]) => prev.map((x) => x.id === id ? { ...x, stat: `${count} ${t('src.channels')} · ${t('src.justNow')}` } : x));
      flash(`${t('src.reloaded')} ${count} ${t('src.channels')}.`);
    }
  }

  // The active playlist is the last usable entry (see getUserSourceUrl),
  // so "use this one" moves it to the end of the list.
  function makeActive(id: string) {
    const s = live.find((x) => x.id === id);
    if (!s) return;
    setLive([...live.filter((x) => x.id !== id), s]);
    invalidateCache();
    flash(`"${s.title}" ${t('src.nowActive')}`);
  }

  const activeId = [...live].reverse().find((x) => /^(https?:\/\/|local:|provider:)/i.test(x.sub))?.id;

  const editForm = (kind: 'live' | 'epg') => editing && editing.kind === kind && (
    <form
      className="ac-source-edit"
      onSubmit={(e) => { e.preventDefault(); saveEdit(); }}
    >
      <div className="ac-card-title" style={{ marginBottom: 10 }}>
        {kind === 'live' ? t('src.editTitle') : t('src.editEpgTitle')}
      </div>
      {kind === 'live' && (
        <div className="ac-field">
          <label className="ac-field-label">{t('src.friendly')}</label>
          <input
            className="ac-input"
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          />
        </div>
      )}
      <div className="ac-field">
        <label className="ac-field-label">{kind === 'live' ? t('src.m3uUrl') : t('src.xmlUrl')}</label>
        <input
          className="ac-input"
          dir="ltr"
          type="url"
          inputMode="url"
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={editing.url}
          onChange={(e) => setEditing({ ...editing, url: e.target.value })}
        />
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="submit" className="ac-btn ac-btn-primary">{t('src.save')}</button>
        <button type="button" className="ac-btn ac-btn-ghost" onClick={() => setEditing(null)}>{t('src.cancel')}</button>
      </div>
    </form>
  );

  return (
    <Shell active="sources">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">{t('src.eyebrow')}</div>
        <h1 className="ac-panel-title">{t('src.title')}</h1>
        <p className="ac-panel-sub">
          {t('src.sub')}
        </p>
        <ActiveSourceIndicator />
      </header>

      <div className="ac-source-tabs">
        <button onClick={() => setTab('live')} className={`ac-source-tab ${tab==='live' ? 'ac-source-tab-active':''}`}>{t('src.tabPlaylist')}</button>
        <button onClick={() => setTab('epg')}  className={`ac-source-tab ${tab==='epg'  ? 'ac-source-tab-active':''}`}>{t('src.tabEpg')}</button>
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
          <div className="ac-card-title">{t('src.activeLive')} · {live.length}</div>

          {live.length > 1 && (
            <p className="ac-field-help" style={{ margin: '0 0 12px' }}>{t('src.onePlaylistNote')}</p>
          )}
          {live.map((s) => (
            <div key={s.id} className="ac-source">
              <div className="ac-source-icon">{s.kind}</div>
              <div className="ac-source-meta">
                <div className="ac-source-title">
                  {s.title}
                  {s.id === activeId && (
                    <span className="ac-status-pill ac-status-ok" style={{ fontSize: 10, marginInlineStart: 8 }}>{t('src.active')}</span>
                  )}
                </div>
                <div className="ac-source-url" dir="ltr">
                  {maskSourceUrl(s.sub)}
                </div>
              </div>
              <div className="ac-source-stats"><div>{s.stat}</div></div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {s.id !== activeId && (
                  <button className="ac-btn ac-btn-sm ac-btn-primary" onClick={() => makeActive(s.id)}>{t('src.setActive')}</button>
                )}
                <button className="ac-btn ac-btn-sm" onClick={() => startEdit('live', s)}>{t('src.edit')}</button>
                <button className="ac-btn ac-btn-sm" onClick={() => refreshLive(s.id)}>{t('src.refresh')}</button>
                <button className="ac-btn ac-btn-sm ac-btn-danger" onClick={() => removeFrom(live, setLive)(s.id)}>{t('src.remove')}</button>
              </div>
            </div>
          ))}

          {editForm('live')}

          <div style={{ marginTop: 20, paddingTop: 24, borderTop: '1px dashed var(--ns-border)' }}>
            <div className="ac-card-title" style={{ marginBottom: 12 }}>{t('src.addNew')}</div>

            <div className="ac-source-tabs" style={{ marginBottom: 18 }}>
              {(['m3u', 'upload', 'xtream', 'stalker'] as AddTab[]).map((id) => (
                <button
                  key={id}
                  onClick={() => setAddTab(id)}
                  className={`ac-source-tab ${addTab === id ? 'ac-source-tab-active' : ''}`}
                >
                  {({ m3u: t('src.pasteUrl'), upload: t('src.uploadFile'), xtream: t('prov.xtream'), stalker: t('prov.stalker') } as Record<AddTab, string>)[id]}
                </button>
              ))}
            </div>

            {(addTab === 'xtream' || addTab === 'stalker') && (
              <ProviderForm key={addTab} type={addTab} onAdded={onProviderAdded} />
            )}
            {(addTab === 'm3u' || addTab === 'upload') && (
            <form onSubmit={(e) => { e.preventDefault(); addLive(); }}>
              <div className="ac-field">
                <label className="ac-field-label">{t('src.friendly')}</label>
                <input className="ac-input" placeholder={t('src.friendlyPh')} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="ac-field">
                <label className="ac-field-label">{addTab === 'upload' ? t('src.uploadLabel') : t('src.m3uUrl')}</label>
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
                          flash(t('src.tooLarge'));
                          return;
                        }
                        const text = await f.text();
                        if (!/#EXTM3U|#EXTINF/i.test(text)) {
                          flash(t('src.notM3u'));
                          return;
                        }
                        const localId = `up-${Date.now().toString(36)}`;
                        try {
                          localStorage.setItem(localM3UKey(localId), text);
                        } catch {
                          flash(t('src.storageFull'));
                          return;
                        }
                        setUrl(`local:${localId}`);
                        if (!name.trim()) setName(f.name.replace(/\.(m3u8?|txt)$/i, ''));
                        flash(`${t('src.fileLoaded')} (${(f.size / 1024).toFixed(0)} KB) ${t('src.fileLoadedHint')}`);
                      }}
                    />
                  : <input className="ac-input" dir="ltr" placeholder="https://your-provider.tv/get.php?username=...&password=..." value={url} onChange={(e) => setUrl(e.target.value)} />
                }
                <div className="ac-field-help">
                  {addTab === 'upload'
                    ? t('src.helpUpload')
                    : t('src.helpUrl')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                <button type="submit" className="ac-btn ac-btn-primary">{t('src.addPlaylist')}</button>
                <button type="button" className="ac-btn ac-btn-ghost" onClick={testUrl}>{t('src.testOnly')}</button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}

      {tab === 'epg' && (
        <div className="ac-card">
          <div className="ac-card-title">{t('src.epgSources')} · {epg.length}</div>
          {epg.map((s) => (
            <div key={s.id} className="ac-source">
              <div className="ac-source-icon" style={{ background: 'rgba(125,249,198,0.10)', color: 'var(--ns-ok)' }}>{s.kind}</div>
              <div className="ac-source-meta">
                <div className="ac-source-title">{s.title}</div>
                <div className="ac-source-url" dir="ltr">{maskSourceUrl(s.sub)}</div>
              </div>
              <div className="ac-source-stats"><div>{s.stat}</div></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="ac-btn ac-btn-sm" onClick={() => startEdit('epg', s)}>{t('src.edit')}</button>
                <button className="ac-btn ac-btn-sm ac-btn-danger" onClick={() => removeFrom(epg, setEpg)(s.id)}>{t('src.remove')}</button>
              </div>
            </div>
          ))}
          {editForm('epg')}
          <form className="ac-add-source" style={{ marginTop: 18 }} onSubmit={(e) => { e.preventDefault(); addEpg(); }}>
            <input className="ac-input" dir="ltr" placeholder="XMLTV URL (https://...)" value={epgUrl} onChange={(e) => setEpgUrl(e.target.value)} />
            <button type="submit" className="ac-btn ac-btn-primary">{t('src.addEpg')}</button>
          </form>
          <div className="ac-field-help" style={{ marginTop: 8 }}>
            {t('src.epgHelp')}
          </div>
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
  const { t } = useT();
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
        onChange={(e) => {
          setMode(e.target.checked ? 'direct' : 'proxy');
          // Notify any currently-mounted player so it can reattach
          // with the new mode. Without this, the toggle silently has
          // no effect until the user re-tunes — exactly the "doesn't
          // work well" symptom.
          try { window.dispatchEvent(new Event('ns-stream-mode-changed')); }
          catch { /* ignore */ }
        }}
        style={{ marginTop: 4, width: 18, height: 18, cursor: 'pointer' }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
          {t('src.direct')} · {isDirect ? t('src.enabled') : t('src.off')}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ns-text-faint)', lineHeight: 1.5 }}>
          {t('src.directHelp')}
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
  const { t } = useT();
  const [active, setActive] = useState<{ url: string; title: string } | null>(null);
  useEffect(() => {
    setActive(getUserSourceUrl());
    // Re-check on every storage event (e.g. usePersisted writing the new list).
    const onStorage = () => setActive(getUserSourceUrl());
    window.addEventListener('storage', onStorage);
    // Also poll while this screen is open — usePersisted writes happen in
    // the same tab, which doesn't fire the storage event.
    const timer = setInterval(onStorage, 1200);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(timer); };
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
      <span>{ok ? t('src.activePlaylist') : t('src.noPlaylist')}</span>
      {active && (
        <code style={{
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          fontSize: 12, fontWeight: 400,
          background: 'rgba(255,255,255,0.06)',
          padding: '2px 6px', borderRadius: 4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          maxWidth: '60ch',
        }} dir="ltr">{maskSourceUrl(active.url)}</code>
      )}
    </div>
  );
}
