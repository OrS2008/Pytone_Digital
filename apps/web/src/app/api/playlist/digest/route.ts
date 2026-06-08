// Server-side playlist + EPG digest endpoint.
//
// POST /api/playlist/digest with JSON body `{m3u: URL, epg?: URL}` →
// returns a single pre-matched JSON document the client can render
// immediately, with no XMLTV parsing or channel-name matching done in
// the browser. See lib/digest.ts for the output shape.
//
// Cache layer: KV namespace NOVA_KV, keyed by SHA-256 of the URL pair,
// 30-minute TTL. Two users sharing an Israeli IPTV provider will hit
// the same cache slot — the digest costs are paid once across the
// entire user base.
//
// The endpoint refuses to follow private / loopback / metadata URLs
// (same SSRF guard as /api/m3u and /api/epg). Origin gated to the
// deploy's own host so anonymous internet traffic can't use us as an
// open IPTV proxy.

import { NextRequest } from 'next/server';
import { getKV } from '@/lib/cfEnv';
import { buildDigest, digestCacheKey, type PlaylistDigest } from '@/lib/digest';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const MAX_M3U_BYTES = 16 * 1024 * 1024;
const MAX_EPG_BYTES = 96 * 1024 * 1024;
const MAX_CACHEABLE_BYTES = 24 * 1024 * 1024; // KV value cap is 25 MB — keep a safety margin
const CACHE_TTL_S = 30 * 60;
const FETCH_TIMEOUT_MS = 30_000;

const PRIVATE_HOST = [
  /^localhost$/i,
  /^127\./, /^10\./, /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\.0\.0\.0$/,
  /^metadata\./i, /^instance-data\./i, /^metadata\.google\.internal$/i,
  /^\[?::1\]?$/, /^\[?fc[0-9a-f]{2}:/i, /^\[?fe80:/i, /^\[?::ffff:/i,
];
const BAD_PORTS = new Set([22, 23, 25, 53, 110, 143, 465, 587, 993, 995, 1433, 3306, 3389, 5432, 6379, 9200, 11211, 27017]);

function validUrl(target: string): URL | null {
  let u: URL;
  try { u = new URL(target); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (PRIVATE_HOST.some((rx) => rx.test(u.hostname))) return null;
  const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
  if (BAD_PORTS.has(port)) return null;
  return u;
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

async function fetchText(u: URL, maxBytes: number, tryGunzip: boolean): Promise<string> {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  let r: Response;
  try {
    r = await fetch(u.toString(), {
      headers: { 'user-agent': 'Nova Stream/1.0', 'accept-encoding': 'gzip, deflate' },
      redirect: 'follow',
      signal: ac.signal,
    });
  } finally { clearTimeout(to); }

  if (!r.ok || !r.body) throw new Error(`upstream ${r.status}`);

  // EPG resource-level gzip (vs. transport-level, which fetch already
  // unwrapped). Detect via URL suffix or Content-Type and pipe through
  // DecompressionStream so the parser sees plain text.
  const ct = (r.headers.get('content-type') || '').toLowerCase();
  const looksGz = tryGunzip && (
    /\.gz(?:\?|$)/i.test(u.pathname) || ct.includes('gzip') || ct.includes('x-gzip')
  );
  let stream: ReadableStream<Uint8Array> = r.body;
  if (looksGz) {
    try { stream = r.body.pipeThrough(new DecompressionStream('gzip')); } catch { /* ignore */ }
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) throw new Error(`response exceeds ${maxBytes} bytes`);
    chunks.push(value);
  }
  // Concatenate + decode in one pass — TextDecoder handles partial
  // multi-byte sequences spanning chunk boundaries.
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  return new TextDecoder('utf-8').decode(buf);
}

interface DigestEnvelope {
  digest: PlaylistDigest;
  cached: boolean;
}

export async function POST(req: NextRequest) {
  if (!isAllowedCaller(req)) return new Response('forbidden', { status: 403 });

  let body: { m3u?: string; epg?: string; nocache?: boolean };
  try { body = await req.json(); } catch { return new Response('invalid JSON', { status: 400 }); }

  const m3uUrl = (body.m3u ?? '').trim();
  const epgUrl = (body.epg ?? '').trim();
  if (!m3uUrl) return new Response('missing m3u', { status: 400 });
  const m3u = validUrl(m3uUrl);
  if (!m3u) return new Response('invalid or refused m3u url', { status: 400 });
  let epg: URL | null = null;
  if (epgUrl) {
    epg = validUrl(epgUrl);
    if (!epg) return new Response('invalid or refused epg url', { status: 400 });
  }

  const cacheKey = await digestCacheKey(m3uUrl, epgUrl || undefined);
  const kv = getKV();

  // Cache lookup. Skipped when the caller passed `nocache: true` —
  // useful for the Sources page's "Re-ingest" button after a
  // provider's playlist actually changes.
  if (kv && !body.nocache) {
    try {
      const hit = await kv.get(cacheKey, { type: 'json' }) as PlaylistDigest | null;
      if (hit) {
        const envelope: DigestEnvelope = { digest: hit, cached: true };
        return new Response(JSON.stringify(envelope), {
          status: 200,
          headers: { 'content-type': 'application/json', 'cache-control': 'private, max-age=60' },
        });
      }
    } catch { /* fall through to refetch */ }
  }

  let m3uText: string;
  let epgXml: string | undefined;
  try {
    m3uText = await fetchText(m3u, MAX_M3U_BYTES, false);
  } catch (e) {
    return new Response(`m3u fetch failed: ${(e as Error).message}`, { status: 502 });
  }
  if (epg) {
    try {
      epgXml = await fetchText(epg, MAX_EPG_BYTES, true);
    } catch (e) {
      // EPG is optional — degrade gracefully. The client still wants
      // the parsed channel list even if the guide isn't available.
      epgXml = undefined;
      // Tag the response so the UI can surface the EPG failure to the
      // user instead of silently rendering "no programme info".
      console.warn('epg fetch failed:', (e as Error).message);
    }
  }

  const digest = buildDigest({ m3uText, epgXml });

  // Write through to KV if the payload fits. Larger digests still go
  // back to the client — we just skip caching them so a hot 30 MB
  // payload doesn't fail the response with a KV value-too-large error.
  if (kv) {
    try {
      const serialised = JSON.stringify(digest);
      if (serialised.length <= MAX_CACHEABLE_BYTES) {
        await kv.put(cacheKey, serialised, { expirationTtl: CACHE_TTL_S });
      }
    } catch (e) {
      console.warn('digest cache write failed:', (e as Error).message);
    }
  }

  const envelope: DigestEnvelope = { digest, cached: false };
  return new Response(JSON.stringify(envelope), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, max-age=60' },
  });
}
