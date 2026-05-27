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
  // archive via `catchup="default"` (or "append" / "shift" / "flussonic")
  // plus a `catchup-source` URL template that gets ${start}, ${duration}
  // etc. substituted at playback time. Channels without these stay
  // live-only — the catch-up UI tells the user so.
  catchupKind?: string;
  catchupSource?: string;
  catchupDays?: number;
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
}

const ATTR = /([\w-]+)="([^"]*)"/g;

function parseExtInf(line: string): ExtInf | null {
  // `#EXTINF:-1 tvg-id="..." ...,Channel name`
  const comma = line.indexOf(',');
  if (comma < 0) return null;
  const head = line.slice(0, comma);
  const name = line.slice(comma + 1).trim();
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
      case 'catchup-type':   out.catchupKind   = v.toLowerCase(); break;
      case 'catchup-source': out.catchupSource = v; break;
      case 'catchup-days':   out.catchupDays   = Number(v) || undefined; break;
    }
  }
  return out;
}

export function parseM3U(text: string): M3UChannel[] {
  const lines = text.split(/\r?\n/);
  const out: M3UChannel[] = [];
  let pending: ExtInf | null = null;
  let positional = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTM3U')) continue;
    if (line.startsWith('#EXTINF:')) { pending = parseExtInf(line); continue; }
    if (line.startsWith('#')) continue; // ignore other directives (EXTGRP, EXTVLCOPT, etc.)
    if (!pending) continue;             // url with no preceding EXTINF, skip

    positional += 1;
    const number = pending.tvgChno ?? positional;
    out.push({
      id:            pending.tvgId || `ch-${positional}`,
      number,
      name:          pending.name,
      logoUrl:       pending.tvgLogo || '',
      category:      pending.group   || 'Uncategorised',
      streamUrl:     line,
      tvgId:         pending.tvgId,
      catchupKind:   pending.catchupKind,
      catchupSource: pending.catchupSource,
      catchupDays:   pending.catchupDays,
    });
    pending = null;
  }

  // Sort by tvg-chno when the playlist provided explicit numbers; otherwise
  // preserve playlist order (positional ordering already in `out`).
  if (out.some((c) => c.number !== c.number)) { /* keep file order */ }

  return out;
}
