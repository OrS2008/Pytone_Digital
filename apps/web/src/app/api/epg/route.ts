// XMLTV EPG proxy — same shape as /api/m3u, separate route so we can
// tune size limits + cache headers independently. EPG XML can be much
// larger than M3U playlists, and stays valid for hours, so we allow a
// bigger response body and a longer browser cache window.

import { NextRequest } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 96 * 1024 * 1024; // 96 MB — large country guides exist
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

function isAllowedCaller(req: NextRequest): boolean {
  const ref = req.headers.get('origin') || req.headers.get('referer') || '';
  if (!ref) return false;
  let refHost: string;
  try { refHost = new URL(ref).host; } catch { return false; }
  const ownHost = req.headers.get('host') || '';
  if (refHost === ownHost) return true;
  const extra = (process.env.ALLOWED_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return extra.includes(refHost);
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
  const BAD_PORTS = new Set([22, 23, 25, 53, 110, 143, 465, 587, 993, 995, 1433, 3306, 3389, 5432, 6379, 9200, 11211, 27017]);
  if (BAD_PORTS.has(port)) return new Response('refused: blocked port', { status: 400 });

  let upstream: Response;
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      upstream = await fetch(u.toString(), {
        // accept gzip so a typical 80 MB XMLTV ships in ~6 MB and
        // streams much faster across the wire
        headers: { 'user-agent': 'Nova Stream/1.0', 'accept-encoding': 'gzip, deflate' },
        redirect: 'follow',
        signal: ac.signal,
      });
    } finally { clearTimeout(to); }
  } catch (e) {
    return new Response(`upstream fetch failed: ${(e as Error).message}`, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response(`upstream returned ${upstream.status}`, { status: 502 });
  }

  const reader = upstream.body.getReader();
  let total = 0;
  const stream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) return controller.close();
      total += value.byteLength;
      if (total > MAX_BYTES) {
        controller.error(new Error('EPG exceeds 96 MB cap'));
        return;
      }
      controller.enqueue(value);
    },
    cancel() { reader.cancel(); },
  });

  const corsOrigin = req.headers.get('origin') || '';
  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      // EPG snapshots change slowly. A 30-minute private cache means
      // a re-mount of /tv/live doesn't refetch a multi-megabyte file
      // every time, but still picks up fresh data within a half-hour.
      'cache-control': 'private, max-age=1800',
      ...(corsOrigin ? { 'access-control-allow-origin': corsOrigin, vary: 'Origin' } : {}),
    },
  });
}
