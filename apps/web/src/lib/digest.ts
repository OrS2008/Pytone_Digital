// Server-side playlist + EPG digest.
//
// The web client used to do this itself: fetch the M3U, fetch the
// XMLTV (often 20–80 MB), gunzip it, parse it, build a tvg-id index,
// then run a 3-pass match against every channel in the M3U to populate
// now/next. On a slow phone the full pipeline can take 8–15 seconds
// per page load.
//
// ClouDDy works around this by doing every step on their cloud. We do
// the same — run the parse + match in a Cloudflare Pages function,
// cache the digest in KV by (m3u_url, epg_url) hash, and hand each
// device a single compact JSON file.
//
// Output shape is intentionally small: programmes are grouped by the
// channel's *M3U* identifier (tvgId or fallback id) so the client
// doesn't need its own matching pass.
//
// Note: this module assumes the caller has already validated the URLs
// (private-address blocking, port allowlist, etc.). The /api/playlist/
// digest route reuses the safety check from /api/m3u + /api/epg.

import { parseM3U, type M3UChannel } from './m3u';
import {
  indexProgrammes,
  indexChannelNames,
  normaliseChannelName,
  stripQualityTags,
  type EpgProgramme,
} from './epg';

export interface DigestProgramme {
  s: number;          // start (epoch ms)
  e: number;          // end / stop (epoch ms)
  t: string;          // title
  d?: string;         // description
  c?: string;         // catchup-id
}

export interface DigestChannel extends M3UChannel {
  /** Programmes within the [windowStartMs, windowEndMs] cut-off. */
  programmes: DigestProgramme[];
}

export interface PlaylistDigest {
  meta: {
    fetchedAt:   number;
    m3uBytes:    number;
    epgBytes:    number;
    totalChannels:   number;
    matchedChannels: number;
    programmes:      number;
    windowStartMs:   number;
    windowEndMs:     number;
  };
  channels: DigestChannel[];
}

// We don't ship the entire XMLTV history through every device. A
// rolling window of ±8 days (catchup-days of 7 plus a buffer for
// timezone drift) is plenty for the live banner, /tv/catchup and the
// programme guide. Programmes outside the window get dropped during
// the digest pass.
const WINDOW_DAYS_BACK    = 8;
const WINDOW_DAYS_FORWARD = 8;

interface BuildArgs {
  m3uText: string;
  epgXml?: string;
  now?:    number;
}

// Walk the EPG index once, picking matching programmes for each M3U
// channel — same algorithm as client-side `programmesFor`, except we
// drop anything outside the time window and project to the compact
// DigestProgramme shape on the way out.
function pickProgrammes(
  channel: M3UChannel,
  byId:    Map<string, EpgProgramme[]>,
  byName:  Map<string, string>,
  windowStart: number,
  windowEnd:   number,
): DigestProgramme[] {
  // 1. exact tvg-id   → channel-id
  let progs = byId.get(channel.tvgId || '') ?? byId.get(channel.id);

  // 2. normalised display name → channel-id (with the stripped-quality
  //    fallback so "Discovery HD" finds "Discovery")
  if (!progs || progs.length === 0) {
    const norm = normaliseChannelName(channel.name);
    if (norm) {
      const cid = byName.get(norm) ?? byName.get(stripQualityTags(norm));
      if (cid) progs = byId.get(cid);
    }
  }
  if (!progs || progs.length === 0) return [];

  const out: DigestProgramme[] = [];
  for (const p of progs) {
    if (p.stop <= windowStart) continue;
    if (p.start >= windowEnd)  break; // index is sorted by start
    const item: DigestProgramme = { s: p.start, e: p.stop, t: p.title };
    if (p.description) item.d = p.description;
    if (p.catchupId)   item.c = p.catchupId;
    out.push(item);
  }
  return out;
}

export function buildDigest({ m3uText, epgXml, now = Date.now() }: BuildArgs): PlaylistDigest {
  const channels = parseM3U(m3uText);
  const windowStart = now - WINDOW_DAYS_BACK * 86_400_000;
  const windowEnd   = now + WINDOW_DAYS_FORWARD * 86_400_000;

  const byId   = epgXml ? indexProgrammes(epgXml)   : new Map<string, EpgProgramme[]>();
  const byName = epgXml ? indexChannelNames(epgXml) : new Map<string, string>();

  let matchedChannels = 0;
  let totalProgrammes = 0;
  const enriched: DigestChannel[] = channels.map((ch) => {
    const programmes = pickProgrammes(ch, byId, byName, windowStart, windowEnd);
    if (programmes.length > 0) {
      matchedChannels++;
      totalProgrammes += programmes.length;
    }
    return { ...ch, programmes };
  });

  return {
    meta: {
      fetchedAt:       now,
      m3uBytes:        m3uText.length,
      epgBytes:        epgXml?.length ?? 0,
      totalChannels:   channels.length,
      matchedChannels,
      programmes:      totalProgrammes,
      windowStartMs:   windowStart,
      windowEndMs:     windowEnd,
    },
    channels: enriched,
  };
}

// Stable digest cache key. SHA-256 over "<m3uUrl>|<epgUrl>" so two
// users sharing a provider see the same cache slot — a real win when
// hundreds of accounts come from one Israeli IPTV reseller.
export async function digestCacheKey(m3uUrl: string, epgUrl?: string): Promise<string> {
  const data = new TextEncoder().encode(`${m3uUrl}|${epgUrl ?? ''}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex  = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `digest:${hex}`;
}
