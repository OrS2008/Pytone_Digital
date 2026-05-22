'use client';

/*
 * Search — real client-side filter across the channels the user
 * actually loaded (their M3U on /tv/account/sources). With Web Speech
 * API behind the mic button so users can speak the query instead of
 * typing.
 *
 * Tries the user's channels first; falls back to a thin demo list
 * when no playlist is configured so the page is never empty.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import TvNav from '@/components/tv/TvNav';
import { TvFocusProvider } from '@/components/tv/TvFocus';
import { getCachedChannels, loadChannels } from '@/lib/channelCache';
import type { M3UChannel } from '@/lib/m3u';

interface SpeechRecognitionResult { transcript: string }
interface SpeechRecognitionEvent { results: { 0: { 0: SpeechRecognitionResult } } & ArrayLike<unknown> }
interface SpeechRecognitionInstance {
  lang: string; interimResults: boolean; continuous: boolean;
  start: () => void; stop: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror:  ((e: { error?: string }) => void) | null;
  onend:    (() => void) | null;
}
declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    SpeechRecognition?:        new () => SpeechRecognitionInstance;
  }
}

export default function SearchHome() {
  const [q, setQ] = useState('');
  // Hydrate synchronously from the shared cache so the channel grid
  // appears instantly when the user comes back from another tab.
  const [channels, setChannels] = useState<M3UChannel[]>(
    (typeof window !== 'undefined' ? getCachedChannels() : null) ?? [],
  );
  const [loading, setLoading]   = useState(channels.length === 0);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const parsed = await loadChannels();
      if (cancelled) return;
      setChannels(parsed);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return channels.slice(0, 60);
    return channels.filter((c) =>
      c.name.toLowerCase().includes(needle) ||
      c.category.toLowerCase().includes(needle) ||
      String(c.number).includes(needle),
    ).slice(0, 200);
  }, [q, channels]);

  // ---- Voice ----------------------------------------------------------
  const recRef = useRef<SpeechRecognitionInstance | null>(null);

  function startVoice() {
    setVoiceError(null);
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) { setVoiceError('Voice search is not supported on this browser.'); return; }
    try {
      const r = new Ctor();
      r.lang = (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
      r.interimResults = false;
      r.continuous = false;
      r.onresult = (e) => {
        const transcript = (e.results[0] as unknown as { 0: SpeechRecognitionResult })[0].transcript;
        setQ(transcript);
      };
      r.onerror = (e) => {
        if (e.error === 'not-allowed') setVoiceError('Microphone permission was denied.');
        else if (e.error === 'no-speech') setVoiceError('No speech detected. Try again.');
        else setVoiceError('Voice search failed.');
      };
      r.onend = () => setListening(false);
      r.start();
      recRef.current = r;
      setListening(true);
    } catch { setVoiceError('Voice search unavailable.'); }
  }
  function stopVoice() { recRef.current?.stop(); setListening(false); }

  return (
    <TvFocusProvider>
      <main style={{ minHeight: '100vh' }}>
        <div style={{ height: 100 }}><TvNav /></div>

        <div style={{ padding: '24px 24px 16px', maxWidth: 980, margin: '0 auto' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="search"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search channels, films, sports, shows…"
              style={{
                width: '100%',
                fontSize: 24,
                padding: '18px 56px 18px 24px',
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.04)',
                color: '#E9EBF1',
                outline: 'none',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            />
            <button
              type="button"
              onClick={listening ? stopVoice : startVoice}
              title={listening ? 'Stop listening' : 'Search by voice'}
              aria-label={listening ? 'Stop voice search' : 'Start voice search'}
              style={{
                position: 'absolute',
                right: 10, top: '50%', transform: 'translateY(-50%)',
                width: 44, height: 44, borderRadius: 999,
                border: 0,
                background: listening ? '#FF3B6E' : 'rgba(255,255,255,0.08)',
                color: '#fff', fontSize: 20, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: listening ? '0 0 0 6px rgba(255,59,110,0.18)' : 'none',
                transition: 'all 160ms',
              }}
            >
              {listening ? '■' : '🎤'}
            </button>
          </div>

          {voiceError && (
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--ns-danger, #FF6B7B)' }}>{voiceError}</div>
          )}

          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16,
            color: '#B7BEC9', fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            <span style={{ opacity: 0.6, alignSelf: 'center', marginRight: 6 }}>Try:</span>
            {['News', 'Sports', 'Movies', 'Kids', 'HD'].map((s) => (
              <button
                key={s}
                onClick={() => setQ(s)}
                style={{
                  padding: '8px 14px', borderRadius: 999,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'inherit', cursor: 'pointer', fontSize: 14,
                  fontFamily: 'inherit',
                }}
              >{s}</button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div style={{ padding: '0 24px 64px', maxWidth: 1280, margin: '0 auto' }}>
          {loading && <p style={{ color: '#B7BEC9' }}>Loading your channels…</p>}
          {!loading && channels.length === 0 && (
            <p style={{ color: '#B7BEC9' }}>
              Add your playlist in{' '}
              <Link href="/tv/account/sources" style={{ color: 'var(--ns-accent, #FF3B6E)' }}>Playlists &amp; EPG</Link>{' '}
              to search across your channels.
            </p>
          )}
          {!loading && channels.length > 0 && (
            <>
              <div style={{ fontSize: 13, color: '#6E7480', marginBottom: 14 }}>
                {q.trim() ? `${filtered.length} result${filtered.length === 1 ? '' : 's'} for "${q}"` : `${channels.length} channels loaded`}
              </div>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12,
              }}>
                {filtered.map((c) => (
                  // Deep-link straight into the player at fullscreen
                  // by passing ?ch=<number> — the live page reads
                  // this and enters watching mode on mount.
                  <Link
                    key={c.id + '-' + c.number}
                    href={`/tv/live?ch=${encodeURIComponent(String(c.number))}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '48px 1fr',
                      gap: 12, alignItems: 'center',
                      padding: 12,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 12,
                      textDecoration: 'none',
                      color: '#E9EBF1',
                    }}
                  >
                    <div style={{
                      width: 48, height: 48, borderRadius: 8,
                      background: '#161A22',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden',
                    }}>
                      {c.logoUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={c.logoUrl} alt="" style={{ maxWidth: 44, maxHeight: 44, objectFit: 'contain' }} />
                        : <span style={{ fontWeight: 700, color: '#6E7480' }}>{c.number}</span>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.name}
                      </div>
                      <div style={{ fontSize: 12, color: '#8B95A7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        #{c.number} · {c.category}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </TvFocusProvider>
  );
}
