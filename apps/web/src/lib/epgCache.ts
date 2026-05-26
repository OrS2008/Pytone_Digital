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
import { indexProgrammes } from './epg';
import type { Channel, Programme } from '@/components/tv/live/types';
import { userKey } from './session';

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
  index:     Map<string, EpgProgramme[]>;
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

export async function loadEpgIndex(): Promise<Map<string, EpgProgramme[]> | null> {
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
      const index = indexProgrammes(xml);
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
  };
}

// Returns a new channel list with now/next1/next2 populated wherever
// an EPG match exists. Channels with no matching tvg-id are passed
// through unchanged so the UI doesn't lose anything when the EPG is
// incomplete (which it usually is for a fraction of the playlist).
export function hydrateChannels<T extends HydratableChannel>(channels: T[], index: Map<string, EpgProgramme[]>): Channel[] {
  const now = Date.now();
  return channels.map((ch) => {
    const progs = index.get(ch.tvgId || ch.id);
    if (!progs || progs.length === 0) {
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
