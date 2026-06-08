// EPG cache + hydration.
//
// Flow:
//   1. /tv/live (or whoever) calls loadEpg(). We resolve the user's
//      XMLTV URL from localStorage; if none is set, no-op.
//   2. We fetch via /api/epg (same-origin proxy because providers
//      almost never set CORS), parse with iterProgrammes, and build
//      a tvg-id -> Programme[] index.
//   3. hydrateChannels() walks that index and fills now/next1/next2
//      on every channel whose `tvgId` (or `id`) matches.
//
// We deliberately do not write the parsed index to sessionStorage —
// it can be huge (12K channels × many programmes × ~200 B each ≈ tens
// of MB). The in-memory module-level cache survives SPA navigation;
// a hard reload re-parses.

import type { EpgProgramme } from './epg';
import { indexProgrammes, indexChannelNames, normaliseChannelName, stripQualityTags } from './epg';
import type { Channel, Programme } from '@/components/tv/live/types';
import { userKey } from './session';

// The hydration index now carries both the programme list (keyed by
// XMLTV channel id) AND a normalised-name → channel-id lookup so
// channels whose tvg-id doesn't match can still find their EPG by
// name. EpgIndex is the single object every caller hands around.
export interface EpgIndex {
  byId:   Map<string, EpgProgramme[]>;
  byName: Map<string, string>;
}

// Resolve programmes for a channel, trying (in order):
//   1. exact tvg-id  → channel-id   (fastest, what existed before)
//   2. exact M3U id  → channel-id   (some playlists put tvg-id under id)
//   3. normalised channel display name (drops punctuation / case)
//   4. normalised name without quality / region tag (HD, IL, …)
// Falls back to [] when nothing matches.
export function programmesFor(
  idx: EpgIndex,
  channel: { tvgId?: string; id: string; name: string },
): EpgProgramme[] {
  const direct = idx.byId.get(channel.tvgId || '') ?? idx.byId.get(channel.id);
  if (direct && direct.length) return direct;

  const norm = normaliseChannelName(channel.name);
  if (norm) {
    const cid = idx.byName.get(norm);
    if (cid) {
      const arr = idx.byId.get(cid);
      if (arr && arr.length) return arr;
    }
    const stripped = stripQualityTags(norm);
    if (stripped !== norm) {
      const cid2 = idx.byName.get(stripped);
      if (cid2) {
        const arr = idx.byId.get(cid2);
        if (arr && arr.length) return arr;
      }
    }
  }
  return [];
}

// Channels at this layer come from the M3U parser, but once we hydrate
// them with now/next they widen to the full Channel type. We accept
// the broader shape so callers can pass either freshly-parsed channels
// or already-hydrated ones (re-running hydration on the latter just
// refreshes the now/next pointers when the EPG index changes).
type HydratableChannel = Pick<Channel, 'id' | 'number' | 'name' | 'logoUrl' | 'category' | 'streamUrl'> & {
  tvgId?: string;
};

interface StoredSource { id: string; kind: string; title: string; sub: string; stat: string }

interface EpgEntry {
  url:       string;
  fetchedAt: number;
  index:     EpgIndex;
}

const MAX_AGE_MS = 30 * 60_000;
const MEM: Map<string, EpgEntry> = new Map();
let inflight: Promise<EpgEntry | null> | null = null;

function memKey() { return userKey('epg'); }

export function getUserEpgUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(userKey('sources.epg'));
    if (!raw) return null;
    const list = JSON.parse(raw) as StoredSource[];
    const src = list.find((s) => isRealEpgUrl(s.sub));
    return src ? src.sub : null;
  } catch { return null; }
}

function isRealEpgUrl(sub: string): boolean {
  if (!sub) return false;
  if (!/^https?:\/\//i.test(sub)) return false;
  if (/provider\.example/i.test(sub)) return false;
  if (/•/.test(sub)) return false;
  return true;
}

export async function loadEpgIndex(): Promise<EpgIndex | null> {
  const url = getUserEpgUrl();
  if (!url) return null;

  const mem = MEM.get(memKey());
  if (mem && mem.url === url && Date.now() - mem.fetchedAt < MAX_AGE_MS) {
    return mem.index;
  }
  if (inflight) {
    const result = await inflight;
    return result?.index ?? null;
  }

  inflight = (async () => {
    try {
      const r = await fetch('/api/epg?url=' + encodeURIComponent(url));
      if (!r.ok) return null;
      const xml = await r.text();
      const byId   = indexProgrammes(xml);
      const byName = indexChannelNames(xml);
      const index: EpgIndex = { byId, byName };
      const entry: EpgEntry = { url, fetchedAt: Date.now(), index };
      MEM.set(memKey(), entry);
      return entry;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();

  const result = await inflight;
  return result?.index ?? null;
}

// Find the current programme and the next two for a given list. The
// list is sorted by start, and we've already dropped anything that
// stopped in the past, so the search is linear and almost always
// terminates on the first item.
function pickNowNext(progs: EpgProgramme[], now: number): { now?: EpgProgramme; next1?: EpgProgramme; next2?: EpgProgramme } {
  let current: EpgProgramme | undefined;
  const upcoming: EpgProgramme[] = [];
  for (const p of progs) {
    if (p.start <= now && p.stop > now) current = p;
    else if (p.start > now) upcoming.push(p);
  }
  return { now: current, next1: upcoming[0], next2: upcoming[1] };
}

function toProgramme(p: EpgProgramme): Programme {
  return {
    id: `${p.channelId}-${p.start}`,
    title: p.title,
    start: new Date(p.start),
    stop:  new Date(p.stop),
    description: p.description,
    catchupAvailable: true,
    catchupId: p.catchupId,
  };
}

// Returns a new channel list with now/next1/next2 populated wherever
// an EPG match exists. Channels with no matching tvg-id are passed
// through unchanged so the UI doesn't lose anything when the EPG is
// incomplete (which it usually is for a fraction of the playlist).
export function hydrateChannels<T extends HydratableChannel & { name: string }>(channels: T[], index: EpgIndex): Channel[] {
  const now = Date.now();
  return channels.map((ch) => {
    const progs = programmesFor(index, ch);
    if (progs.length === 0) {
      return ch as Channel; // no EPG match — keep stream-only entry
    }
    const { now: cur, next1, next2 } = pickNowNext(progs, now);
    return {
      ...ch,
      now:   cur   ? toProgramme(cur)   : undefined,
      next1: next1 ? toProgramme(next1) : undefined,
      next2: next2 ? toProgramme(next2) : undefined,
    } as Channel;
  });
}
