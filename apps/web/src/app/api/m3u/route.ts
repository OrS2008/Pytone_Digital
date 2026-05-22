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

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 16 * 1024 * 1024;

const PRIVATE_HOST = [
  /^localhost$/i,
  /^127\./, /^10\./, /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^metadata\./i, /^instance-data\./i,
  /^\[?::1\]?$/, /^\[?fc[0-9a-f]{2}:/i, /^\[?fe80:/i,
];

function isHostBlocked(host: string): boolean {
  return PRIVATE_HOST.some((rx) => rx.test(host));
}

export async function GET(req: NextRequest) {
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

  let upstream: Response;
  try {
    upstream = await fetch(u.toString(), {
      headers: { 'user-agent': 'Nova Stream/0.1 (+https://novastram.netlify.app)' },
      redirect: 'follow',
    });
  } catch (e) {
    return new Response(`upstream fetch failed: ${(e as Error).message}`, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response(`upstream returned ${upstream.status}`, { status: 502 });
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

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'application/x-mpegurl; charset=utf-8',
      'cache-control': 'private, max-age=60',
      'access-control-allow-origin': '*',
    },
  });
}
