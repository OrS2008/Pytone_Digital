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
      case 'catchup-type':       out.catchupKind       = v.toLowerCase(); break;
      case 'catchup-source':     out.catchupSource     = v; break;
      case 'catchup-days':       out.catchupDays       = Number(v) || undefined; break;
      case 'catchup-correction': out.catchupCorrection = parseCatchupCorrection(v); break;
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
      catchupKind:       pending.catchupKind       ?? defaults.catchupKind,
      catchupSource:     pending.catchupSource     ?? defaults.catchupSource,
      catchupDays:       pending.catchupDays       ?? defaults.catchupDays,
      catchupCorrection: pending.catchupCorrection ?? defaults.catchupCorrection,
    });
    pending = null;
  }

  // Sort by tvg-chno when the playlist provided explicit numbers; otherwise
  // preserve playlist order (positional ordering already in `out`).
  if (out.some((c) => c.number !== c.number)) { /* keep file order */ }

  return out;
}
