// Minimal M3U / M3U8 parser.
//
// Handles the de-facto extended M3U format used by every IPTV provider:
//
//   #EXTM3U
//   #EXTINF:-1 tvg-id="il.kan11" tvg-logo="https://.../kan11.png" group-title="Israel",כאן 11
//   http://provider/play/abc123/index.m3u8
//
// Optional attributes we care about: tvg-id (EPG match), tvg-logo (UI),
// group-title (category), tvg-chno (channel number). The display name is
// everything after the first comma on the EXTINF line. The next non-blank,
// non-#  line is the stream URL.
//
// Channel numbers are inferred:
//   1. tvg-chno when present,
//   2. otherwise the position in the playlist.

export interface M3UChannel {
  id: string;
  number: number;
  name: string;
  logoUrl: string;
  category: string;
  streamUrl: string;
  tvgId?: string;
  // Catch-up support. Providers signal whether a channel has a DVR
  // archive via `catchup="default"` (or "append" / "shift" / "flussonic"
  // / "xc" / "vod") plus a `catchup-source` URL template that gets
  // ${start}, ${duration} etc. substituted at playback time. Channels
  // without these stay live-only.
  //
  // `catchupCorrection` is a signed `HH:MM` offset some providers
  // include to compensate for an EPG that's in a different timezone
  // than the timeshift endpoint expects. We add it to the requested
  // programme start before building the URL.
  catchupKind?: string;
  catchupSource?: string;
  catchupDays?: number;
  catchupCorrection?: number; // minutes, signed
  /** Provider-declared request headers. Many panels gate their edges on
   *  a specific User-Agent (and sometimes Referer) and answer anything
   *  else with a 403 or an empty manifest — which reads to the player as
   *  a dead channel. Carried through to /api/stream so the proxy asks
   *  the way the playlist says to ask. */
  httpUserAgent?: string;
  httpReferrer?: string;
}

interface ExtInf {
  tvgId?: string;
  tvgLogo?: string;
  tvgChno?: number;
  group?: string;
  name: string;
  catchupKind?: string;
  catchupSource?: string;
  catchupDays?: number;
  catchupCorrection?: number;
  httpUserAgent?: string;
  httpReferrer?: string;
}

// "+02:00" / "-01:30" / "+3" / "-2" / "120" / "-90" — pvr.iptvsimple
// accepts a few shapes here. Returns minutes (signed), or undefined
// when the value is unparseable.
function parseCatchupCorrection(raw: string): number | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  const hm = /^([+-]?)(\d{1,2}):(\d{2})$/.exec(v);
  if (hm) {
    const sign = hm[1] === '-' ? -1 : 1;
    return sign * (Number(hm[2]) * 60 + Number(hm[3]));
  }
  const num = Number(v);
  if (Number.isFinite(num)) {
    // Bare integer is interpreted as MINUTES, matching pvr.iptvsimple.
    return num;
  }
  return undefined;
}

const ATTR = /([\w-]+)="([^"]*)"/g;


// Split an EXTINF line into its attribute head and its display name.
//
// The separator is the first comma that is NOT inside a quoted
// attribute value. Using indexOf(',') is wrong on any playlist that
// carries a browser user-agent, because those contain a comma of their
// own:
//
//   #EXTINF:-1 http-user-agent="Mozilla/5.0 (… (KHTML, like Gecko) …)"
//              group-title="General",1+1 International
//                              ^ real separator
//                     ^ indexOf(',') stopped here
//
// Splitting at the inner comma truncated the head, so every attribute
// after the user-agent — group-title, and catchup / catchup-source
// when they trail it — silently vanished, and the channel name came
// out as the tail of the user-agent string.
function splitExtInf(line: string): { head: string; name: string } | null {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) {
      return { head: line.slice(0, i), name: line.slice(i + 1).trim() };
    }
  }
  return null;
}

function parseExtInf(line: string): ExtInf | null {
  // `#EXTINF:-1 tvg-id="..." ...,Channel name`
  const split = splitExtInf(line);
  if (!split) return null;
  const { head, name } = split;
  const out: ExtInf = { name };
  let m: RegExpExecArray | null;
  while ((m = ATTR.exec(head)) !== null) {
    const [, k, v] = m;
    switch (k.toLowerCase()) {
      case 'tvg-id':         out.tvgId   = v; break;
      case 'tvg-logo':       out.tvgLogo = v; break;
      case 'group-title':    out.group   = v; break;
      case 'tvg-chno':       out.tvgChno = Number(v) || undefined; break;
      case 'catchup':
      case 'catchup-type':       out.catchupKind       = v.toLowerCase(); break;
      case 'catchup-source':     out.catchupSource     = v; break;
      case 'catchup-days':       out.catchupDays       = Number(v) || undefined; break;
      case 'catchup-correction': out.catchupCorrection = parseCatchupCorrection(v); break;
      case 'http-user-agent':
      case 'user-agent':         out.httpUserAgent     = v; break;
      case 'http-referrer':
      case 'http-referer':       out.httpReferrer      = v; break;
    }
  }
  return out;
}

export function parseM3U(text: string): M3UChannel[] {
  const lines = text.split(/\r?\n/);
  const out: M3UChannel[] = [];
  let pending: ExtInf | null = null;
  let positional = 0;
  // Header-level defaults. Some providers (Xtream Codes especially)
  // declare catchup once on the #EXTM3U line and expect every channel
  // below to inherit it. Without inheriting, we'd think nothing on the
  // playlist supports DVR.
  const defaults: Pick<ExtInf, 'catchupKind' | 'catchupSource' | 'catchupDays' | 'catchupCorrection'> = {};
  // tvg-id is an EPG pointer, not an identity: the SD / HD / FHD
  // variants of one channel almost always carry the same value. Using
  // it verbatim as `id` collided the React key in the (windowed)
  // channel rail and made My List treat every variant as one entry —
  // favouriting BeIN HD lit up BeIN FHD too. The first occurrence
  // keeps the bare value so favourites saved before this still
  // resolve; later ones get a positional suffix.
  const usedIds = new Set<string>();
  let sawExplicitNumber = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTM3U')) {
      // Parse attributes off the header so per-channel entries can
      // omit catchup= and still inherit it.
      const head = line.slice('#EXTM3U'.length);
      let m: RegExpExecArray | null;
      ATTR.lastIndex = 0;
      while ((m = ATTR.exec(head)) !== null) {
        const k = m[1].toLowerCase();
        const v = m[2];
        if (k === 'catchup' || k === 'catchup-type') defaults.catchupKind       = v.toLowerCase();
        if (k === 'catchup-source')                  defaults.catchupSource     = v;
        if (k === 'catchup-days')                    defaults.catchupDays       = Number(v) || undefined;
        if (k === 'catchup-correction')              defaults.catchupCorrection = parseCatchupCorrection(v);
      }
      continue;
    }
    if (line.startsWith('#EXTINF:')) { pending = parseExtInf(line); continue; }
    if (line.startsWith('#EXTVLCOPT:')) {
      // The other half of the header convention. VLC-style options
      // attach to the EXTINF above them, so they are folded into the
      // pending entry rather than skipped with the other directives.
      const opt = line.slice('#EXTVLCOPT:'.length);
      const eq = opt.indexOf('=');
      if (pending && eq > 0) {
        const k = opt.slice(0, eq).trim().toLowerCase();
        const v = opt.slice(eq + 1).trim();
        if (k === 'http-user-agent') pending.httpUserAgent = v;
        if (k === 'http-referrer' || k === 'http-referer') pending.httpReferrer = v;
      }
      continue;
    }
    if (line.startsWith('#')) continue; // ignore other directives (EXTGRP, etc.)
    if (!pending) continue;             // url with no preceding EXTINF, skip

    positional += 1;
    if (pending.tvgChno != null) sawExplicitNumber = true;
    const number = pending.tvgChno ?? positional;
    let id = pending.tvgId || `ch-${positional}`;
    if (usedIds.has(id)) id = `${id}#${positional}`;
    usedIds.add(id);
    out.push({
      id,
      number,
      name:          pending.name,
      logoUrl:       pending.tvgLogo || '',
      category:      pending.group   || 'Uncategorised',
      streamUrl:     line,
      tvgId:         pending.tvgId,
      catchupKind:       pending.catchupKind       ?? defaults.catchupKind,
      catchupSource:     pending.catchupSource     ?? defaults.catchupSource,
      catchupDays:       pending.catchupDays       ?? defaults.catchupDays,
      catchupCorrection: pending.catchupCorrection ?? defaults.catchupCorrection,
      httpUserAgent:     pending.httpUserAgent,
      httpReferrer:      pending.httpReferrer,
    });
    pending = null;
  }

  // Sort by tvg-chno when the playlist provided explicit numbers;
  // otherwise preserve playlist order (already encoded in `positional`).
  // The guard here used to read `c.number !== c.number`, which is only
  // ever true for NaN — and tvg-chno is parsed with `Number(v) ||
  // undefined`, so it never is. The condition was dead and the sort it
  // guarded was never written, leaving the rail's channel numbers out
  // of order against the list they label. Array#sort is stable, so
  // entries sharing a number keep their relative file order.
  if (sawExplicitNumber) out.sort((a, b) => a.number - b.number);

  return out;
}
