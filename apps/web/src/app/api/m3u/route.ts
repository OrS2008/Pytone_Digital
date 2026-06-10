// Server-side proxy for M3U / Xtream playlists.
//
// Why this exists:
//   The IPTV provider hosting the user's M3U almost never sets
//   Access-Control-Allow-Origin for browser requests. A direct fetch
//   from novastram.netlify.app to provider.tv is blocked by CORS,
//   so the playlist can't be loaded client-side. This route runs as
//   a Netlify serverless function — same origin as the page — and
//   pipes the upstream body back to the browser with permissive CORS.
//
//   Once the real playlist-ingestion microservice is reachable, this
//   route becomes obsolete (the backend stores parsed M3U + matched
//   EPG and serves channels via gRPC-Web).
//
// SSRF guards:
//   This is a demo proxy with minimal protection — it rejects
//   non-http(s) schemes, hostnames that look private (loopback /
//   RFC1918 / link-local / cloud-metadata), and caps the response
//   size at 16 MB. The Go `safehttp` package in services/playback
//   does this properly at IP dial time after DNS rebinding defence;
//   port that over when the backend is wired up.

import { NextRequest } from 'next/server';
import { validateUpstreamUrl, safeFetch, SsrfBlocked } from '@/lib/ssrfGuard';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 16 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

// Same-origin gate. The proxy is for our own users' M3U fetches, not
// for anyone-on-the-internet abuse of our edge function. We allow
// requests whose Origin or Referer matches the host that is actually
// serving this request — that way the gate works on any deploy
// (Netlify, Cloudflare Pages, custom domain) without rebuild.
function isAllowedCaller(req: NextRequest): boolean {
  const ref = req.headers.get('origin') || req.headers.get('referer') || '';
  if (!ref) return false;
  let refHost: string;
  try { refHost = new URL(ref).host; } catch { return false; }

  // Same-origin is always allowed.
  const ownHost = req.headers.get('host') || '';
  if (refHost === ownHost) return true;

  // Plus any additional hosts explicitly allowlisted by deploy env.
  // Useful when a CDN or alternate domain fronts the same project.
  const extra = (process.env.ALLOWED_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return extra.includes(refHost);
}

export async function GET(req: NextRequest) {
  if (!isAllowedCaller(req)) {
    return new Response('forbidden', { status: 403 });
  }
  const target = req.nextUrl.searchParams.get('url');
  if (!target) return new Response('missing ?url=', { status: 400 });

  const check = validateUpstreamUrl(target);
  if ('reason' in check) return new Response(check.reason, { status: 400 });
  const u = check.url;

  let upstream: Response;
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      upstream = (await safeFetch(u.toString(), {
        headers: {
          // Mimic a real browser — some IPTV reseller panels gate
          // playlist downloads to known user-agents.
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        },
      }, { maxRedirects: 4, signal: ac.signal })).response;
    } finally { clearTimeout(to); }
  } catch (e) {
    if (e instanceof SsrfBlocked) return new Response(e.reason, { status: 400 });
    return new Response(`upstream fetch failed: ${(e as Error).message}`, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response(`upstream returned ${upstream.status}`, { status: 502 });
  }

  // Some captive portals / WAFs return text/html when the real
  // playlist is unreachable — refuse to forward that to the parser
  // because hls.js / our M3U parser would silently fail.
  const ct = (upstream.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('text/html')) {
    return new Response('upstream returned HTML (likely captive portal / login page)', { status: 502 });
  }

  // Cap the response size to defend against an enormous playlist that
  // would memory-blow the edge function.
  const reader = upstream.body.getReader();
  let total = 0;
  const stream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) return controller.close();
      total += value.byteLength;
      if (total > MAX_BYTES) {
        controller.error(new Error('playlist exceeds 16 MB cap'));
        return;
      }
      controller.enqueue(value);
    },
    cancel() { reader.cancel(); },
  });

  // Echo the request Origin into the CORS header so the playlist is
  // only readable by the page that asked for it (same-origin in
  // practice; isAllowedCaller already gated that). A wildcard '*' here
  // would let any attacker site read the user's M3U from their own
  // origin while the user is signed in — same-site cookies wouldn't
  // help because cookies aren't on the response anyway.
  const corsOrigin = req.headers.get('origin') || '';
  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'application/x-mpegurl; charset=utf-8',
      'cache-control': 'private, max-age=60',
      ...(corsOrigin ? { 'access-control-allow-origin': corsOrigin, vary: 'Origin' } : {}),
    },
  });
}
