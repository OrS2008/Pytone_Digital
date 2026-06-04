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
}

export function proxiedStreamUrl(upstream: string): string {
  if (!upstream) return upstream;
  if (upstream.startsWith('/api/stream?')) return upstream;
  if (!/^https?:\/\//i.test(upstream)) return upstream;
  const mode = getStreamMode();
  const suffix = mode === 'direct' ? '&mode=direct' : '';
  return `/api/stream?url=${encodeURIComponent(upstream)}${suffix}`;
}
