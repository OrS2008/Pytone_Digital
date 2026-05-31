// Catch-up URL builder.
//
// IPTV providers signal DVR / time-shift support via two attributes
// on each EXTINF line:
//
//   catchup="default" | "append" | "shift" | "flussonic" | "xc"
//   catchup-source="<URL template with placeholders>"
//
// The template placeholders we substitute are the common ones used
// across Stalker, Xtream Codes, Flussonic, and Telerik:
//
//   ${start}         start time as ISO-style YYYY-MM-DD-HH-MM-SS
//   {start}          alias of ${start}
//   ${utc}           start time as a unix epoch in SECONDS
//   ${utcend}        end   time as a unix epoch in SECONDS
//   ${duration}      duration in MINUTES
//   ${offset}        offset from now in seconds (positive = past)
//   ${Y} ${m} ${d} ${H} ${M} ${S}
//                    individual UTC date / time fields, zero-padded
//
// When the provider's M3U doesn't declare catchup support at all we
// have no URL to build — the caller treats that as "no catch-up
// available for this channel" and the UI shows an explanation rather
// than silently playing the live edge.

import type { M3UChannel } from './m3u';

export interface CatchupRequest {
  channel: M3UChannel;
  startMs: number;
  durationMin: number;
}

export interface CatchupResult {
  /** Final URL to play. null when the channel can't catch-up. */
  url: string | null;
  /** Human-friendly reason when url is null. */
  reason?: string;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }

function expandTemplate(template: string, req: CatchupRequest): string {
  const start = new Date(req.startMs);
  const stop  = new Date(req.startMs + req.durationMin * 60_000);
  const offset = Math.max(0, Math.floor((Date.now() - req.startMs) / 1000));
  const utc    = Math.floor(req.startMs / 1000);
  const utcend = Math.floor(stop.getTime() / 1000);
  const Y = String(start.getUTCFullYear());
  const m = pad2(start.getUTCMonth() + 1);
  const d = pad2(start.getUTCDate());
  const H = pad2(start.getUTCHours());
  const M = pad2(start.getUTCMinutes());
  const S = pad2(start.getUTCSeconds());
  const isoStart = `${Y}-${m}-${d}-${H}-${M}-${S}`;

  const subs: Record<string, string> = {
    'start':     isoStart,
    'utc':       String(utc),
    'utcend':    String(utcend),
    'duration':  String(req.durationMin),
    'offset':    String(offset),
    'Y':         Y,
    'm':         m,
    'd':         d,
    'H':         H,
    'M':         M,
    'S':         S,
    'timestamp': String(utc),
    'lutc':      String(Math.floor(Date.now() / 1000)),
  };

  // Replace ${name} and {name} forms. Done with a single scan so we
  // don't double-substitute when a value happens to contain another
  // placeholder-looking substring.
  return template.replace(/\$?\{([A-Za-z][\w]*)\}/g, (m_, key) => {
    return Object.prototype.hasOwnProperty.call(subs, key) ? subs[key] : m_;
  });
}

// Xtream Codes (the most common IPTV backend) URLs come in many
// shapes depending on the panel version and provider config:
//
//   /USER/PASS/SID(.ext)
//   /live/USER/PASS/SID(.ext)
//   /play/USER/PASS/SID(.ext)
//   /ts/USER/PASS/SID(.ext)
//   /<anything>/USER/PASS/SID(.ext)
//
// What's always true is that the LAST three path segments are
// USER, PASS, and a numeric SID — and timeshift always lives at
// /timeshift/USER/PASS/DURATION_MIN/YYYY-MM-DD:HH-MM/SID.ts
// regardless of where the live URL sat. So we parse the URL with
// URL(), take the last 3 segments, and rebuild from origin.
//
// This is what Cloddy / Tivimate / IPTV Smarters / OTT Navigator
// do. The legacy /streaming/timeshift.php?... endpoint only works
// on very old panels.
//
// Date format: SERVER LOCAL TIME (browser local time, which usually
// matches the panel's region for residential users). Xtream panels
// interpret the date in the path as their own local time, so a
// browser in Israel asking for "18:00 local" must say :18-00, not
// the UTC equivalent :16-00.

function inferXtreamCatchup(req: CatchupRequest): string | null {
  let url: URL;
  try { url = new URL(req.channel.streamUrl); }
  catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 3) return null;

  const last = parts[parts.length - 1];
  // Xtream stream IDs are always numeric, with optional .m3u8 / .ts
  // extension. This is what distinguishes a real Xtream URL from a
  // random CDN URL that happens to have three path segments.
  const sidMatch = /^([0-9]+)(?:\.[a-z0-9]+)?$/i.exec(last);
  if (!sidMatch) return null;
  const sid  = sidMatch[1];
  const pass = parts[parts.length - 2];
  const user = parts[parts.length - 3];

  const base = `${url.protocol}//${url.host}`;
  const d = new Date(req.startMs);
  const Y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const H  = String(d.getHours()).padStart(2, '0');
  const M  = String(d.getMinutes()).padStart(2, '0');
  // Always .m3u8 for browser playback. .ts is what desktop / mobile
  // IPTV apps (Cloddy, TiViMate) use because they bundle a native
  // MPEG-TS demuxer, but <video> in every browser can only play
  // .m3u8 (via hls.js) — raw MPEG-TS sets video.src and fires no
  // events, which is exactly the "auto-jumps to live" symptom users
  // reported. Panels that serve .m3u8 live almost always serve
  // .m3u8 timeshift; the few that don't aren't browser-playable
  // anyway, so .m3u8 is the right default everywhere.
  return `${base}/timeshift/${encodeURIComponent(user)}/${encodeURIComponent(pass)}`
    + `/${req.durationMin}`
    + `/${Y}-${mo}-${da}:${H}-${M}`
    + `/${sid}.m3u8`;
}

export function buildCatchupUrl(req: CatchupRequest): CatchupResult {
  const ch = req.channel;

  // "default" with an explicit catchup-source: just expand the template.
  if (ch.catchupSource) {
    return { url: expandTemplate(ch.catchupSource, req) };
  }

  // For "default" / "xc" / unset catchup kind on a Xtream-shaped URL,
  // the modern /timeshift/USER/PASS/DUR/DATE/ID URL is what every IPTV
  // app on the market uses (Cloddy, Tivimate, IPTV Smarters, OTT
  // Navigator, etc.). We try it before the append-query heuristic
  // because the heuristic is far less likely to be the actual
  // implementation of "default" on a modern Xtream panel.
  const kind = (ch.catchupKind || '').toLowerCase();
  const live = ch.streamUrl;
  const utc    = Math.floor(req.startMs / 1000);
  const utcend = Math.floor((req.startMs + req.durationMin * 60_000) / 1000);

  if (!kind || kind === 'default' || kind === 'xc') {
    const xt = inferXtreamCatchup(req);
    if (xt) return { url: xt };
    if (!kind) {
      return {
        url: null,
        reason:
          "This channel's playlist doesn't declare a catch-up archive and the live URL isn't a recognisable Xtream pattern. " +
          "Ask your provider for a playlist with catchup / catchup-source attributes.",
      };
    }
    // kind = 'default' / 'xc' on a non-Xtream URL — fall through to the
    // append heuristic below.
  }

  // append / shift / flussonic heuristics — best-effort fallbacks when
  // the playlist names a kind but doesn't ship a catchup-source template.
  if (kind === 'append' || kind === 'xc' || kind === 'default') {
    const sep = live.includes('?') ? '&' : '?';
    return { url: `${live}${sep}utc=${utc}&lutc=${Math.floor(Date.now() / 1000)}` };
  }
  if (kind === 'shift' || kind === 'flussonic') {
    const sep = live.includes('?') ? '&' : '?';
    return { url: `${live}${sep}t=${utc}&tend=${utcend}` };
  }

  return {
    url: null,
    reason:
      "Unknown catch-up kind: " + kind + ". " +
      "The playlist would need a catchup-source URL template for this provider.",
  };
}
