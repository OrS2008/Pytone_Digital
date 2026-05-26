'use client';

/*
 * Smart home row.
 *
 * Reads the tenant's actual playlist (via channelCache, no extra fetch
 * if it's already in memory) and renders a row of curated channels.
 * "AI" here means: a category-keyword scorer in pickChannels() that
 * picks the most likely-relevant channels for each row (Sports, News,
 * Movies, Kids, Music…) plus a small "Live now" row that mixes
 * top-of-list channels for variety.
 *
 * Until a real recommendation backend lands this is the closest we can
 * get without making the user wait — and crucially, it uses *their*
 * channels, so the tiles look meaningful rather than generic.
 */

import { useEffect, useState } from 'react';
import type { M3UChannel } from '@/lib/m3u';
import { getCachedChannels, loadChannels } from '@/lib/channelCache';
import LivePreviewTile from './LivePreviewTile';

interface Props {
  title:    string;
  /** Which kind of row to populate. */
  pick:     'live' | 'sports' | 'news' | 'movies' | 'kids' | 'music' | 'documentary' | 'entertainment';
  /** Max tiles to render. */
  limit?:   number;
}

// Lightweight keyword scorer. Lower-cased substring hits across the
// channel name AND category drive the score. The first match in
// PRIMARY is worth more than a match in SECONDARY so e.g. a channel
// literally called "ESPN" outranks one whose category mentions sport.
const KEYWORDS: Record<Props['pick'], { primary: string[]; secondary: string[] }> = {
  sports: {
    primary:   ['sport', 'espn', 'fox sports', 'eurosport', 'bein', 'sky sports', 'sportv', 'one', 'tnt', 'dazn'],
    secondary: ['football', 'soccer', 'basketball', 'tennis', 'nba', 'nhl', 'nfl', 'mlb', 'ufc', 'mma', 'golf', 'cricket', 'rugby', 'league', 'liga', 'serie a', 'champions', 'premier'],
  },
  news: {
    primary:   ['news', 'cnn', 'bbc', 'fox news', 'sky news', 'al jazeera', 'reuters', 'bloomberg', 'cnbc', 'i24'],
    secondary: ['breaking', '24', 'business', 'world', 'politik', 'דיווח', 'חדשות'],
  },
  movies: {
    primary:   ['movies', 'cinema', 'film', 'hbo', 'starz', 'showtime', 'amc', 'paramount', 'mgm', 'sundance'],
    secondary: ['action', 'drama', 'thriller', 'classic', 'tcm', 'epix', 'hits'],
  },
  kids: {
    primary:   ['kids', 'cartoon', 'nick', 'disney', 'boomerang', 'baby', 'jim jam', 'cbeebies', 'pop'],
    secondary: ['toon', 'family', 'junior', 'children', 'duck'],
  },
  music: {
    primary:   ['music', 'mtv', 'vh1', 'kiss', 'trace', 'mezzo', 'stingray'],
    secondary: ['hits', 'pop', 'rock', 'r&b', 'urban', 'club', 'classic'],
  },
  documentary: {
    primary:   ['documentary', 'discovery', 'national geographic', 'nat geo', 'history', 'animal planet', 'crime', 'investigation'],
    secondary: ['nature', 'science', 'wild', 'travel', 'planet', 'how it'],
  },
  entertainment: {
    primary:   ['entertainment', 'mtv', 'comedy central', 'e!', 'tlc', 'reality', 'lifestyle', 'bravo'],
    secondary: ['drama', 'show', 'series', 'sitcom', 'cooking', 'food'],
  },
  // "Live now" is intentionally generic: just take the first N channels
  // (skipping anything that looks like a placeholder/test entry).
  live: { primary: [], secondary: [] },
};

const SKIP = /(test|placeholder|24\/?7 vod|info channel|backup)/i;

function score(c: M3UChannel, kw: { primary: string[]; secondary: string[] }): number {
  if (SKIP.test(c.name) || SKIP.test(c.category)) return 0;
  const hay = (c.name + ' ' + c.category).toLowerCase();
  let s = 0;
  for (const w of kw.primary)   if (hay.includes(w)) s += 8;
  for (const w of kw.secondary) if (hay.includes(w)) s += 3;
  // Channels with a logo look better as tiles — small bonus.
  if (c.logoUrl) s += 1;
  return s;
}

function pickChannels(all: M3UChannel[], kind: Props['pick'], limit: number): M3UChannel[] {
  if (kind === 'live') {
    return all.filter((c) => !SKIP.test(c.name)).slice(0, limit);
  }
  const kw = KEYWORDS[kind];
  return all
    .map((c) => ({ c, s: score(c, kw) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.c.number - b.c.number)
    .slice(0, limit)
    .map((x) => x.c);
}

export default function SmartHomeRow({ title, pick, limit = 12 }: Props) {
  const [channels, setChannels] = useState<M3UChannel[]>(
    (typeof window !== 'undefined' ? getCachedChannels() : null) ?? [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (channels.length > 0) return;          // already hydrated
      const parsed = await loadChannels();
      if (!cancelled) setChannels(parsed);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (channels.length === 0) return null;       // no playlist → don't show empty row

  const items = pickChannels(channels, pick, limit);
  if (items.length === 0) return null;          // category has no matches in this playlist

  return (
    <div className="tv-row">
      <h2>{title}</h2>
      <div className="tv-row-strip">
        {items.map((c) => (
          <LivePreviewTile key={c.id + '-' + c.number} channel={c} />
        ))}
      </div>
    </div>
  );
}
