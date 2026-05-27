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

// Xtream Codes (the most common IPTV backend) uses a predictable URL
// shape: live  → http://host:port/live/USER/PASS/STREAM_ID.m3u8
//        catch → http://host:port/streaming/timeshift.php
//                  ?username=USER&password=PASS&stream=STREAM_ID
//                  &start=YYYY-MM-DD:HH-MM&duration=MIN
// If the stream URL matches that shape we can build a working
// timeshift URL even without explicit catchup= / catchup-source=
// attributes — useful for the many providers that ship a barebones
// M3U but still run a Xtream backend with DVR enabled.
const XTREAM_LIVE_RE = /^(https?:\/\/[^/]+)\/live\/([^/]+)\/([^/]+)\/(\d+)(?:\.[a-z0-9]+)?(?:\?.*)?$/i;

function inferXtreamCatchup(req: CatchupRequest): string | null {
  const m = XTREAM_LIVE_RE.exec(req.channel.streamUrl);
  if (!m) return null;
  const [, base, user, pass, sid] = m;
  const d = new Date(req.startMs);
  const Y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  const H  = String(d.getUTCHours()).padStart(2, '0');
  const M  = String(d.getUTCMinutes()).padStart(2, '0');
  return `${base}/streaming/timeshift.php`
    + `?username=${encodeURIComponent(user)}`
    + `&password=${encodeURIComponent(pass)}`
    + `&stream=${sid}`
    + `&start=${Y}-${mo}-${da}:${H}-${M}`
    + `&duration=${req.durationMin}`;
}

export function buildCatchupUrl(req: CatchupRequest): CatchupResult {
  const ch = req.channel;

  // "default" with an explicit catchup-source: just expand the template.
  if (ch.catchupSource) {
    return { url: expandTemplate(ch.catchupSource, req) };
  }

  if (!ch.catchupKind) {
    // Last-resort: if the stream URL is recognisably a Xtream URL,
    // try the timeshift endpoint. It either works (provider has DVR)
    // or returns 404 (handled like any other unplayable stream).
    const xt = inferXtreamCatchup(req);
    if (xt) return { url: xt };
    return {
      url: null,
      reason:
        "This channel's playlist doesn't declare a catch-up archive. " +
        "Ask your provider for a playlist with catchup / catchup-source " +
        "attributes, or use a different provider that supports DVR.",
    };
  }

  // No source template but a catchup kind is set. Fall back to the
  // shift/append heuristics commonly emitted by Stalker / Xtream:
  //
  //   append: paste a ?utc=...&lutc=... query onto the live URL.
  //   shift : same idea but with t and tend params.
  //
  // These are best-effort — providers that need a different shape
  // should be using catchup-source above.
  const kind = (ch.catchupKind || '').toLowerCase();
  const live = ch.streamUrl;
  const utc    = Math.floor(req.startMs / 1000);
  const utcend = Math.floor((req.startMs + req.durationMin * 60_000) / 1000);
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
