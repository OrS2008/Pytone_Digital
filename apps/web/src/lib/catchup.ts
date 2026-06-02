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
  /**
   * Alternative URL formats to try if the primary fails. Xtream
   * panels differ in how they spell timeshift; rather than guess
   * which one this provider supports, we hand the player a small
   * list and let it iterate on fatal load errors. Ordered most-
   * likely → least-likely.
   */
  fallbacks?: string[];
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

interface XtreamParts { base: string; user: string; pass: string; sid: string; }

interface FlussonicParts { base: string; stream: string; playlist: string; }

// Flussonic / Wowza / nginx-rtmp servers use a stream-name path
// rather than the Xtream USER/PASS/SID triplet:
//   /STREAM/video.m3u8
//   /STREAM/index.m3u8
//   /s/TOKEN/STREAM/video.m3u8         (signed-URL gateway)
//   /TOKEN/STREAM/index.m3u8           (alt signed-URL shape)
// We detect this by the trailing playlist name (video.m3u8 /
// index.m3u8 / mono.m3u8) and rebuild the timeshift URL with the
// archive path: /STREAM/index-{utc_start}-{duration_sec}.m3u8.
function parseFlussonicLiveUrl(streamUrl: string): FlussonicParts | null {
  let url: URL;
  try { url = new URL(streamUrl); }
  catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1].toLowerCase();
  // Flussonic always names the live playlist video.m3u8 / index.m3u8
  // / mono.m3u8 / playlist.m3u8. If the last segment doesn't end
  // in .m3u8 / .ts this isn't a Flussonic URL.
  if (!/\.m3u8$/.test(last) && !/\.ts$/.test(last)) return null;
  const playlistName = last; // keep original case
  const stream = parts[parts.length - 2];
  // Stream segment must not look like an Xtream numeric SID — those
  // belong to parseXtreamLiveUrl. Flussonic stream names are
  // usually slugs like "discovery-hd-il" or "channel-name-hd".
  if (/^[0-9]+$/.test(stream)) return null;
  const prefixParts = parts.slice(0, parts.length - 2);
  const prefix = prefixParts.length > 0 ? '/' + prefixParts.join('/') : '';
  return {
    base:     `${url.protocol}//${url.host}${prefix}`,
    stream,
    playlist: playlistName,
  };
}

function buildFlussonicCandidates(req: CatchupRequest, p: FlussonicParts): string[] {
  const utcStart = Math.floor(req.startMs / 1_000);
  const durSec   = req.durationMin * 60;
  // Every URL we return MUST use a DVR-specific path that doesn't
  // exist on the live endpoint, so a server without DVR returns a
  // hard 404. URLs that reuse the live playlist name with query
  // parameters (video.m3u8?from=…) are unsafe: many Flussonic builds
  // silently ignore unknown params and serve the live manifest,
  // which the player then plays as if it were the archive. That's
  // the exact bug "catchup tunes the right channel but plays live".
  return [
    // 1. Flussonic DVR archive — standard index-START-DURATION shape
    `${p.base}/${p.stream}/index-${utcStart}-${durSec}.m3u8`,
    // 2. Same shape with the stream's own playlist basename
    `${p.base}/${p.stream}/${p.playlist.replace(/\.m3u8$/i, '')}-${utcStart}-${durSec}.m3u8`,
    // 3. Absolute single-segment timeshift (some Flussonic builds)
    `${p.base}/${p.stream}/timeshift_abs-${utcStart}.m3u8`,
    // 4. Archive variant with explicit "archive-" prefix — used by
    //    some nginx-based Flussonic forks
    `${p.base}/${p.stream}/archive-${utcStart}-${durSec}.m3u8`,
  ];
}

function parseXtreamLiveUrl(streamUrl: string): XtreamParts | null {
  let url: URL;
  try { url = new URL(streamUrl); }
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
  return {
    base: `${url.protocol}//${url.host}`,
    user: parts[parts.length - 3],
    pass: parts[parts.length - 2],
    sid:  sidMatch[1],
  };
}

// Build every URL format a real-world Xtream panel might serve
// timeshift on. Different forks of the panel software answer to
// different shapes; rather than guess we hand the player a small
// ordered list and let it advance on a fatal load error.
function buildXtreamCandidates(req: CatchupRequest, p: XtreamParts): string[] {
  const d = new Date(req.startMs);
  const Y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const H  = String(d.getHours()).padStart(2, '0');
  const M  = String(d.getMinutes()).padStart(2, '0');
  const utcStart = Math.floor(req.startMs / 1_000);
  const utcEnd   = Math.floor((req.startMs + req.durationMin * 60_000) / 1_000);
  const utcNow   = Math.floor(Date.now() / 1_000);
  const u = encodeURIComponent(p.user);
  const pw = encodeURIComponent(p.pass);

  // .m3u8 first because every modern Xtream fork that supports
  // timeshift also serves it as HLS, and <video> can only play HLS
  // via hls.js. Raw MPEG-TS (.ts) works in Cloddy / TiViMate but
  // browsers ignore video.src=*.ts entirely.
  return [
    // 1. Modern XCMS / XUI.one HLS timeshift (colon between date and time)
    `${p.base}/timeshift/${u}/${pw}/${req.durationMin}/${Y}-${mo}-${da}:${H}-${M}/${p.sid}.m3u8`,

    // 2. Same shape, dash-only separator (older XUI.one builds)
    `${p.base}/timeshift/${u}/${pw}/${req.durationMin}/${Y}-${mo}-${da}-${H}-${M}/${p.sid}.m3u8`,

    // 3. Append-mode on the live URL — many Xtream panels honour
    //    ?utc=START&lutc=NOW to rewind the live HLS endpoint
    `${p.base}/live/${u}/${pw}/${p.sid}.m3u8?utc=${utcStart}&lutc=${utcNow}`,

    // 4. Same as #3 without /live/ prefix (older panels)
    `${p.base}/${u}/${pw}/${p.sid}.m3u8?utc=${utcStart}&lutc=${utcNow}`,

    // 5. Flussonic / Wowza style — start / end seconds via query
    `${p.base}/live/${u}/${pw}/${p.sid}.m3u8?from=${utcStart}&to=${utcEnd}`,

    // 6. Legacy timeshift.php (only ancient panels still serve this,
    //    but it's harmless to leave at the end)
    `${p.base}/streaming/timeshift.php?username=${u}&password=${pw}`
      + `&stream=${p.sid}&start=${Y}-${mo}-${da}:${H}-${M}&duration=${req.durationMin}`,
  ];
}

// Collect every URL we know how to spell timeshift on, in
// best-guess order. The player walks the list and stops on the
// first one that loads — so even when the M3U's catchup-source
// template misses the panel's actual convention, one of the
// inferred URLs usually does the right thing.
//
// Order matters: structured archive paths (Flussonic
// /STREAM/index-START-DUR.m3u8, Xtream /timeshift/…/SID.m3u8)
// CANNOT silently serve the live stream — wrong path → hard 404.
// The M3U's catchup-source template, by contrast, is often a copy
// of the live URL with `?utc=X&lutc=Y` slapped on — Flussonic
// ignores unknown query params and happily serves live, and the
// player thinks the catchup URL worked. We put structured paths
// first so the wrong-shape template only gets tried as a last
// resort, after every panel-aware path has 404'd.
function collectAllCandidates(req: CatchupRequest): string[] {
  const ch = req.channel;
  const candidates: string[] = [];
  const push = (u: string) => { if (u && !candidates.includes(u)) candidates.push(u); };

  // 1. Xtream candidates for /USER/PASS/SID-shaped live URLs —
  //    timeshift lives under /timeshift/, distinct path from live.
  const xt = parseXtreamLiveUrl(ch.streamUrl);
  if (xt) for (const u of buildXtreamCandidates(req, xt)) push(u);

  // 2. Flussonic / Wowza candidates for /STREAM/video.m3u8 shapes.
  //    Path-based DVR filenames — 404 on a non-DVR server, never
  //    masquerade as live.
  const fl = parseFlussonicLiveUrl(ch.streamUrl);
  if (fl) for (const u of buildFlussonicCandidates(req, fl)) push(u);

  // 3. The M3U's own catchup-source template, if it provided one.
  //    Last because many providers ship a template that reuses the
  //    live URL with query params — backends like Flussonic ignore
  //    unknown params and silently serve live. Only reached when
  //    the structured candidates above have all failed.
  if (ch.catchupSource) push(expandTemplate(ch.catchupSource, req));

  return candidates;
}

export function buildCatchupUrl(req: CatchupRequest): CatchupResult {
  const ch = req.channel;
  const kind = (ch.catchupKind || '').toLowerCase();
  const live = ch.streamUrl;
  const utc    = Math.floor(req.startMs / 1000);
  const utcend = Math.floor((req.startMs + req.durationMin * 60_000) / 1000);

  const all = collectAllCandidates(req);
  if (all.length > 0) {
    return { url: all[0], fallbacks: all.slice(1) };
  }

  // append / shift / flussonic heuristics — best-effort fallbacks when
  // the playlist names a kind but doesn't ship a catchup-source template
  // and the URL didn't match any known panel shape.
  if (kind === 'append' || kind === 'xc' || kind === 'default') {
    const sep = live.includes('?') ? '&' : '?';
    return { url: `${live}${sep}utc=${utc}&lutc=${Math.floor(Date.now() / 1000)}` };
  }
  if (kind === 'shift' || kind === 'flussonic') {
    const sep = live.includes('?') ? '&' : '?';
    return { url: `${live}${sep}t=${utc}&tend=${utcend}` };
  }

  if (!kind) {
    return {
      url: null,
      reason:
        "This channel's playlist doesn't declare a catch-up archive and the live URL isn't a recognisable Xtream / Flussonic pattern. " +
        "Ask your provider for a playlist with catchup / catchup-source attributes.",
    };
  }

  return {
    url: null,
    reason:
      "Unknown catch-up kind: " + kind + ". " +
      "The playlist would need a catchup-source URL template for this provider.",
  };
}
