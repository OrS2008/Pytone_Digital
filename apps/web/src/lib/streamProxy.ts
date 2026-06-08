// Wrap an upstream IPTV stream URL so the manifest goes through
// /api/stream. Two modes:
//
//   * proxy  (default) — everything (manifest + segments) goes through
//                        us. Safe when the provider doesn't send CORS.
//   * direct           — manifest goes through us (so we can rewrite
//                        URIs and add CORS), but the rewritten manifest
//                        contains absolute upstream segment URLs, so
//                        the browser fetches segments directly from the
//                        provider's CDN. Saves ~99.95% of our egress.
//                        Requires the provider's segments to send
//                        Access-Control-Allow-Origin.
//
// The user picks the mode from Sources → "Direct streaming" toggle.
// Stored per-user (rides the cross-device sync via SYNCED_KEYS) so a
// user who confirmed their provider works in direct mode doesn't have
// to re-toggle on every new device. Defaults to 'proxy' so a fresh
// account never has playback break on first try.

import { userKey } from './session';

const SHORT_KEY = 'prefs.streamMode';
type Mode = 'proxy' | 'direct';

function fullKey(): string {
  return userKey(SHORT_KEY);
}

export function getStreamMode(): Mode {
  if (typeof window === 'undefined') return 'proxy';
  try {
    const raw = localStorage.getItem(fullKey());
    if (raw === '"direct"' || raw === 'direct') return 'direct';
  } catch { /* ignore */ }
  return 'proxy';
}

export function setStreamMode(mode: Mode) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(fullKey(), JSON.stringify(mode)); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event('ns-stream-mode-changed')); } catch { /* ignore */ }
}

// Subscribe to live changes of the stream mode. PlayerSurface uses
// this to force a re-attach when the user flips the toggle while
// watching — without it the hls.js instance stays bound to the
// previously-built URL and the toggle silently has no effect.
export function onStreamModeChange(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const wrapped = () => handler();
  const storage = (e: StorageEvent) => { if (e.key === fullKey()) handler(); };
  window.addEventListener('ns-stream-mode-changed', wrapped);
  window.addEventListener('ns-settings-synced', wrapped); // server sync may rewrite the key
  window.addEventListener('storage', storage);            // cross-tab toggle
  return () => {
    window.removeEventListener('ns-stream-mode-changed', wrapped);
    window.removeEventListener('ns-settings-synced', wrapped);
    window.removeEventListener('storage', storage);
  };
}

export function proxiedStreamUrl(upstream: string): string {
  if (!upstream) return upstream;
  if (upstream.startsWith('/api/stream?')) return upstream;
  if (!/^https?:\/\//i.test(upstream)) return upstream;
  const mode = getStreamMode();
  const suffix = mode === 'direct' ? '&mode=direct' : '';
  return `/api/stream?url=${encodeURIComponent(upstream)}${suffix}`;
}
