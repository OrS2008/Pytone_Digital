// Client wrapper for /api/playlist/digest.
//
// The Programme Guide and (eventually) every other channel-list page
// prefer the pre-matched server digest over downloading the M3U +
// XMLTV separately. We try the digest first; on any failure we let the
// caller fall back to the legacy two-fetch flow so a temporary outage
// on the digest worker doesn't break the app.
//
// The digest blob fits a single sessionStorage entry per (tenant,
// m3u, epg) tuple so an SPA navigation between /tv/guide and
// /tv/catchup doesn't re-hit the network when both want the same
// data.

import type { PlaylistDigest } from './digest';
import { getUserSourceUrl } from './channelCache';
import { getUserEpgUrl } from './epgCache';
import { userKey } from './session';

const MEM: Map<string, { fetchedAt: number; digest: PlaylistDigest }> = new Map();
const MAX_AGE_MS = 30 * 60_000;

function memKey(m3u: string, epg: string): string {
  return userKey(`digest|${m3u}|${epg}`);
}

export interface DigestLoad {
  digest:  PlaylistDigest | null;
  source:  'memory' | 'network' | 'unconfigured' | 'error';
  error?:  string;
}

export async function loadDigest(opts: { nocache?: boolean } = {}): Promise<DigestLoad> {
  if (typeof window === 'undefined') return { digest: null, source: 'unconfigured' };

  const src = getUserSourceUrl();
  if (!src) return { digest: null, source: 'unconfigured' };
  const m3u = src.url;
  const epg = getUserEpgUrl() ?? '';

  const key = memKey(m3u, epg);
  const mem = MEM.get(key);
  if (!opts.nocache && mem && Date.now() - mem.fetchedAt < MAX_AGE_MS) {
    return { digest: mem.digest, source: 'memory' };
  }

  try {
    const r = await fetch('/api/playlist/digest', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ m3u, epg: epg || undefined, nocache: opts.nocache }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return { digest: null, source: 'error', error: `digest ${r.status}: ${body.slice(0, 200)}` };
    }
    const envelope = await r.json() as { digest: PlaylistDigest; cached: boolean };
    MEM.set(key, { fetchedAt: Date.now(), digest: envelope.digest });
    return { digest: envelope.digest, source: 'network' };
  } catch (e) {
    return { digest: null, source: 'error', error: (e as Error).message };
  }
}
