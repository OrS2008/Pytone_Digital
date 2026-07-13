// XMLTV EPG proxy — same shape as /api/m3u, separate route so we can
// tune size limits + cache headers independently. EPG XML can be much
// larger than M3U playlists, and stays valid for hours, so we allow a
// bigger response body and a longer browser cache window.

import { NextRequest } from 'next/server';
import { validateUpstreamUrl, safeFetch, SsrfBlocked } from '@/lib/ssrfGuard';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 96 * 1024 * 1024; // 96 MB — large country guides exist
const TIMEOUT_MS = 30_000;

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

  const check = validateUpstreamUrl(target);
  if ('reason' in check) return new Response(check.reason, { status: 400 });
  const u = check.url;

  let upstream: Response;
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      upstream = (await safeFetch(u.toString(), {
        // accept gzip so a typical 80 MB XMLTV ships in ~6 MB and
        // streams much faster across the wire. The runtime
        // auto-decompresses HTTP transport encoding, so by the time
        // we read upstream.body it's the raw resource bytes.
        headers: {
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          'accept-encoding': 'gzip, deflate',
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

  // Many providers publish .xml.gz instead of .xml. The HTTP transport
  // gzip is already unwrapped above; what we have left is a raw
  // gzipped FILE (resource-level compression), which is a different
  // beast. We detect it by URL suffix and by the upstream
  // content-type, then pipe through a DecompressionStream so the
  // client receives plain XML and our parser works.
  const upstreamCt = (upstream.headers.get('content-type') || '').toLowerCase();
  const looksGz =
       /\.gz(?:\?|$)/i.test(u.pathname)
    || upstreamCt.includes('gzip')
    || upstreamCt.includes('x-gzip');
  let bodyStream: ReadableStream<Uint8Array> = upstream.body;
  if (looksGz) {
    try {
      bodyStream = upstream.body.pipeThrough(new DecompressionStream('gzip'));
    } catch {
      // DecompressionStream unsupported in this runtime — fall back
      // to the raw body and hope the client can cope.
    }
  }

  const reader = bodyStream.getReader();
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
      // Defense-in-depth: proxied XML must never be sniffed into an
      // active document type in our origin.
      'x-content-type-options': 'nosniff',
      ...(corsOrigin ? { 'access-control-allow-origin': corsOrigin, vary: 'Origin' } : {}),
    },
  });
}
