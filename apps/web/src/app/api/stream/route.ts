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

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 30_000;

const PRIVATE_HOST = [
  /^localhost$/i,
  /^127\./, /^10\./, /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\.0\.0\.0$/,
  /^metadata\./i, /^instance-data\./i, /^metadata\.google\.internal$/i,
  /^\[?::1\]?$/, /^\[?fc[0-9a-f]{2}:/i, /^\[?fe80:/i, /^\[?::ffff:/i,
];

function isHostBlocked(host: string): boolean {
  return PRIVATE_HOST.some((rx) => rx.test(host));
}

const BAD_PORTS = new Set([22, 23, 25, 53, 110, 143, 465, 587, 993, 995, 1433, 3306, 3389, 5432, 6379, 9200, 11211, 27017]);

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
  // In direct mode we return the upstream URL verbatim so the browser
  // fetches segments straight from the provider's CDN. In proxy mode
  // we wrap so the segment also comes back through this route.
  return mode === 'direct'
    ? absUrl
    : `/api/stream?url=${encodeURIComponent(absUrl)}`;
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

  let u: URL;
  try { u = new URL(target); } catch { return new Response('invalid url', { status: 400 }); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return new Response('only http / https allowed', { status: 400 });
  }
  if (isHostBlocked(u.hostname)) {
    return new Response('refused: private / metadata host', { status: 400 });
  }
  const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
  if (BAD_PORTS.has(port)) return new Response('refused: blocked port', { status: 400 });

  // Forward Range so the browser can seek into long segments / MP4s
  // through the proxy without re-downloading from the start.
  const range = req.headers.get('range');
  const ifNoneMatch = req.headers.get('if-none-match');
  const headers: Record<string, string> = { 'user-agent': 'Nova Stream/1.0' };
  if (range)        headers['range'] = range;
  if (ifNoneMatch)  headers['if-none-match'] = ifNoneMatch;

  let upstream: Response;
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      upstream = await fetch(u.toString(), { headers, redirect: 'follow', signal: ac.signal });
    } finally { clearTimeout(to); }
  } catch (e) {
    return new Response(`upstream fetch failed: ${(e as Error).message}`, { status: 502 });
  }
  if (!upstream.ok && upstream.status !== 206 && upstream.status !== 304) {
    return new Response(`upstream returned ${upstream.status}`, { status: 502 });
  }

  const ct = (upstream.headers.get('content-type') || '').toLowerCase();
  const looksLikeManifest =
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
    const rewritten = rewriteManifest(text, u.toString(), mode);
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
