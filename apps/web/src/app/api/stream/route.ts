// Generic streaming proxy for HLS / IPTV.
//
// Two operating modes:
//
//   * proxy  (default)  — every URL inside the manifest is rewritten to
//                         come back through this route. The entire HLS
//                         stream flows through us. Safe when the upstream
//                         provider doesn't send CORS headers, but each
//                         segment costs us bandwidth.
//
//   * direct (?mode=direct) — only the manifest itself comes through us
//                         (so we can add CORS to the manifest response).
//                         Segment / variant URLs inside are rewritten to
//                         absolute upstream URLs, so the browser fetches
//                         them directly from the provider's CDN. Bandwidth
//                         cost on our side drops by ~99.95%. Requires the
//                         provider to send `Access-Control-Allow-Origin`
//                         on segments — most modern IPTV CDNs do.
//
// Why even proxy the manifest in direct mode? Because the manifest
// itself often has no CORS header either, and we still need to rewrite
// segment URIs to be absolute (relative URIs in the manifest would
// resolve against our own origin once the browser fetched them).
//
// SSRF guards: identical to /api/m3u — private IP / cloud-metadata
// hostnames refused, dangerous ports blocked, scheme restricted.

import { NextRequest } from 'next/server';
import { validateUpstreamUrl, safeFetch, SsrfBlocked } from '@/lib/ssrfGuard';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 30_000;

function isAllowedCaller(req: NextRequest): boolean {
  const ref = req.headers.get('origin') || req.headers.get('referer') || '';
  if (!ref) return false;
  let refHost: string;
  try { refHost = new URL(ref).host; } catch { return false; }
  if (refHost === (req.headers.get('host') || '')) return true;
  const extra = (process.env.ALLOWED_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return extra.includes(refHost);
}

type RewriteMode = 'proxy' | 'direct';

function rewriteOne(absUrl: string, mode: RewriteMode): string {
  if (mode !== 'direct') return `/api/stream?url=${encodeURIComponent(absUrl)}`;
  // Direct mode: segments + keys go to the provider's CDN, but NESTED
  // manifests (variant playlists inside a master, audio rendition
  // playlists) stay proxied so we can rewrite their inner segment URLs
  // to absolute and add CORS. A master playlist points at variant
  // .m3u8 files — if those came back without CORS, the browser would
  // reject them and playback would die at adaptive-bitrate switch
  // time. Segment files (.ts / .m4s / .mp4 / .vtt / .key) usually have
  // CORS on a real IPTV CDN, which is the whole reason direct mode is
  // a win.
  if (/\.m3u8(\?|$)/i.test(absUrl)) {
    return `/api/stream?url=${encodeURIComponent(absUrl)}&mode=direct`;
  }
  return absUrl;
}

// HLS archive-vs-live signature check.
//
// Flussonic (and the rest of the IPTV server ecosystem) sometimes
// responds to a catch-up URL by silently serving the LIVE manifest:
// the request goes through, status is 200, content-type is HLS, but
// the manifest describes the live edge instead of the requested
// archive window. The player happily plays it — looks like catch-up
// worked, except the wrong content is on screen.
//
// Signal we look at: a real archive manifest carries either
//   #EXT-X-PLAYLIST-TYPE:VOD            (definitively VOD)
// or
//   #EXT-X-ENDLIST                      (manifest is final / bounded)
// Flussonic emits both for archive segments; live emits neither.
//
// If we're confident the caller was asking for an archive URL — see
// looksLikeArchiveRequest() — and neither marker shows up, we reject
// the response with 502 so the caller's existing "advance to the
// next candidate on failure" path takes over.
function manifestLooksLikeArchive(text: string): boolean {
  if (/^\s*#EXT-X-PLAYLIST-TYPE\s*:\s*VOD\b/im.test(text)) return true;
  if (/^\s*#EXT-X-ENDLIST\b/im.test(text)) return true;
  return false;
}

function looksLikeArchiveRequest(upstreamUrl: URL, req: NextRequest): boolean {
  if (req.nextUrl.searchParams.get('expect') === 'archive') return true;
  const p = upstreamUrl.pathname;
  // Flussonic-style archive paths. The leaf is `<base>-<startUtc>-<duration>.m3u8`
  // where <base> is whatever the live playlist filename was: `index`, `archive`,
  // `video`, `mono`, `playlist`, `stream`, ... we accept any word-shape with
  // a >=6-digit start and >=2-digit duration so the guard catches every
  // Flussonic build, not just the official `index/archive` ones.
  if (/\/[a-z0-9_]+-\d{6,}-\d{2,}\.m3u8(?:\?|$)/i.test(p)) return true;
  if (/\/timeshift_(?:abs|rel)-\d+(\.m3u8|$)/i.test(p))    return true;
  if (/\/archive\.m3u8$/i.test(p) && upstreamUrl.searchParams.has('from')) return true;
  // Xtream timeshift path — `/timeshift/USER/PASS/DUR/DATE/SID.m3u8`.
  // A well-behaved Xtream panel returns 404 when timeshift is off; some
  // forks accept the URL but return the live manifest. Guard it.
  if (/\/timeshift\/[^/]+\/[^/]+\/\d+\/[^/]+\/\d+\.m3u8/i.test(p)) return true;
  // Cloddy / Stalker convention — caller appended `utc=` (or `lutc=`)
  // to the LIVE URL to mean "rewind to this time". Many panels ignore
  // these params and silently serve live; that's the worst-offender
  // silent-live case for ordinary IPTV reseller stacks.
  if (upstreamUrl.searchParams.has('utc'))  return true;
  if (upstreamUrl.searchParams.has('lutc')) return true;
  return false;
}

// Rewrite every absolute / relative URL inside an HLS manifest.
// Operates on text content only; if the body isn't an M3U we pass it
// through untouched. Relative URLs are resolved against the manifest's
// own absolute URL first.
function rewriteManifest(text: string, manifestUrl: string, mode: RewriteMode): string {
  const base = new URL(manifestUrl);
  const out: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine;
    const trimmed = line.trim();
    if (!trimmed) { out.push(line); continue; }

    // Tag lines that embed a URI attribute (encryption keys, init
    // segments, alt audio tracks, etc.) — rewrite the URI value.
    if (trimmed.startsWith('#')) {
      const uriMatched = line.replace(/URI="([^"]+)"/g, (_m, uri: string) => {
        try {
          const abs = new URL(uri, base).toString();
          return `URI="${rewriteOne(abs, mode)}"`;
        } catch { return _m; }
      });
      out.push(uriMatched);
      continue;
    }

    // Non-tag, non-blank lines are segment / variant URLs. Resolve
    // against the manifest's URL.
    try {
      const abs = new URL(trimmed, base).toString();
      out.push(rewriteOne(abs, mode));
    } catch {
      out.push(line);
    }
  }
  return out.join('\n');
}

export async function GET(req: NextRequest) {
  if (!isAllowedCaller(req)) return new Response('forbidden', { status: 403 });

  const target = req.nextUrl.searchParams.get('url');
  if (!target) return new Response('missing ?url=', { status: 400 });

  const check = validateUpstreamUrl(target);
  if ('reason' in check) return new Response(check.reason, { status: 400 });
  const u = check.url;

  // Forward Range so the browser can seek into long segments / MP4s
  // through the proxy without re-downloading from the start.
  const range = req.headers.get('range');
  const ifNoneMatch = req.headers.get('if-none-match');
  // Several IPTV providers serve archive content only to user-agents
  // they recognise as a real player — TiViMate, IPTV Smarters, Mozilla.
  // Sending a custom "Nova Stream/1.0" string makes us look like a
  // bot. Mimic a recent Chrome on the request to the provider's
  // servers; the response still flows back to whatever client opened
  // /api/stream.
  const headers: Record<string, string> = {
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  };
  // Forward the end-user's real IP so providers that IP-gate their
  // DVR (Flussonic with allow_X_Forwarded_For; lots of IPTV reseller
  // panels) can see the actual subscriber instead of Cloudflare's
  // edge IP. We ONLY trust cf-connecting-ip (set by Cloudflare's edge);
  // a client-supplied x-forwarded-for is NOT honoured, so a caller
  // can't forge an arbitrary source IP to the upstream.
  const realIp = req.headers.get('cf-connecting-ip');
  if (realIp) {
    headers['x-forwarded-for'] = realIp;
    headers['x-real-ip']       = realIp;
    headers['forwarded']       = `for=${realIp}`;
  }
  if (range)        headers['range'] = range;
  if (ifNoneMatch)  headers['if-none-match'] = ifNoneMatch;

  let upstream: Response;
  let finalUrl: string;
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const r = await safeFetch(u.toString(), { headers }, { maxRedirects: 4, signal: ac.signal });
      upstream = r.response;
      finalUrl = r.finalUrl;
    } finally { clearTimeout(to); }
  } catch (e) {
    if (e instanceof SsrfBlocked) return new Response(e.reason, { status: 400 });
    return new Response(`upstream fetch failed: ${(e as Error).message}`, { status: 502 });
  }
  if (!upstream.ok && upstream.status !== 206 && upstream.status !== 304) {
    return new Response(`upstream returned ${upstream.status}`, { status: 502 });
  }

  // Classify against the FINAL URL (after redirects) — a short-link
  // like jmp2.uk/x.m3u8 may 302 to a CDN path with a different
  // extension, and vice-versa.
  let finalPath = u.pathname;
  try { finalPath = new URL(finalUrl).pathname; } catch { /* keep original */ }
  const ct = (upstream.headers.get('content-type') || '').toLowerCase();
  const looksLikeManifest =
    /\.m3u8(\?|$)/i.test(finalPath) ||
    /\.m3u8(\?|$)/i.test(u.pathname) ||
    ct.includes('mpegurl') ||
    ct.includes('vnd.apple.mpegurl');

  const corsOrigin = req.headers.get('origin') || '';
  const passThroughHeaders: Record<string, string> = {
    'cache-control': 'private, max-age=10',
    ...(corsOrigin ? { 'access-control-allow-origin': corsOrigin, vary: 'Origin' } : {}),
  };

  if (looksLikeManifest && upstream.body) {
    const mode: RewriteMode = req.nextUrl.searchParams.get('mode') === 'direct' ? 'direct' : 'proxy';
    const text = await upstream.text();

    if (looksLikeArchiveRequest(u, req) && !manifestLooksLikeArchive(text)) {
      // Upstream gave us a live manifest in response to an archive
      // request. Surface this as a hard 502 so the player advances.
      return new Response(
        JSON.stringify({
          error:  'silent_live',
          detail: 'Upstream returned a live manifest in response to an archive request. Try the next URL format.',
        }),
        { status: 502, headers: { 'content-type': 'application/json' } },
      );
    }

    // Rewrite relative segment / variant URLs against the FINAL URL
    // (where the manifest actually came from), not the original
    // request URL — otherwise redirect-based streams (short links,
    // load-balancers) resolve every segment against the wrong host
    // and nothing plays.
    const rewritten = rewriteManifest(text, finalUrl, mode);
    return new Response(rewritten, {
      status: 200,
      headers: {
        ...passThroughHeaders,
        'content-type': 'application/vnd.apple.mpegurl; charset=utf-8',
      },
    });
  }

  // Binary pass-through. Forward content headers as-is so the player
  // can read Content-Length / Content-Range / ETag for seeking.
  const out = new Headers(passThroughHeaders);
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
