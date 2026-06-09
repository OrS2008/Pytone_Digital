// POST /api/auth/catchup-probe
//
// User-facing diagnostic. When the live player's catch-up flow burns
// through all 9 candidate URLs without finding one that actually plays
// the archive, the catchup error card surfaces a "Diagnose" button —
// it POSTs here, and we run each candidate from the edge, returning
// the upstream response shape (status, content-type, first 320 bytes
// of the body, isManifest, hasSegments). The user can then see which
// URL pattern (if any) the provider supports + share with support.
//
// Same probe logic as /api/admin/catchup-probe — duplicated rather
// than shared because the admin one will keep extending with admin-
// only options (auth bypass, header sniffing) that don't belong in
// the user surface.
//
// Body: { streamUrl, startUnix, durationMin }
// Auth: session cookie required (any signed-in user).
// SSRF guards mirror /api/stream.

import { NextRequest, NextResponse } from 'next/server';
import { getKV } from '@/lib/cfEnv';
import { readSession, readSessionCookie } from '@/lib/auth/serverSession';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const PRIVATE_HOST = [
  /^localhost$/i, /^127\./, /^10\./, /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^0\.0\.0\.0$/,
  /^metadata\./i, /^instance-data\./i, /^metadata\.google\.internal$/i,
  /^\[?::1\]?$/, /^\[?fc[0-9a-f]{2}:/i, /^\[?fe80:/i, /^\[?::ffff:/i,
];
function isHostBlocked(host: string) { return PRIVATE_HOST.some((rx) => rx.test(host)); }
const BAD_PORTS = new Set([22, 23, 25, 53, 110, 143, 465, 587, 993, 995, 1433, 3306, 3389, 5432, 6379, 9200, 11211, 27017]);

interface FlussonicParts { base: string; stream: string; playlist: string }

function parseFlussonic(streamUrl: string): FlussonicParts | null {
  let url: URL;
  try { url = new URL(streamUrl); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1].toLowerCase();
  if (!/\.m3u8$/.test(last) && !/\.ts$/.test(last)) return null;
  const stream = parts[parts.length - 2];
  if (/^[0-9]+$/.test(stream)) return null;
  const prefixParts = parts.slice(0, parts.length - 2);
  const prefix = prefixParts.length > 0 ? '/' + prefixParts.join('/') : '';
  return {
    base:     `${url.protocol}//${url.host}${prefix}`,
    stream,
    playlist: parts[parts.length - 1],
  };
}

function buildCandidates(startUnix: number, durationMin: number, p: FlussonicParts): string[] {
  const durSec  = durationMin * 60;
  const utcEnd  = startUnix + durSec;
  const utcNow  = Math.floor(Date.now() / 1000);
  const offset  = Math.max(0, utcNow - startUnix);
  const unsigned = p.base.replace(/\/s\/[^/]+(?=$|\/)/, '');
  return [
    `${p.base}/${p.stream}/index-${startUnix}-${durSec}.m3u8`,
    `${p.base}/${p.stream}/${p.playlist.replace(/\.m3u8$/i, '')}-${startUnix}-${durSec}.m3u8`,
    `${p.base}/${p.stream}/archive-${startUnix}-${durSec}.m3u8`,
    `${p.base}/${p.stream}/dvr-${startUnix}-${durSec}.m3u8`,
    `${p.base}/${p.stream}/dvr/index-${startUnix}-${durSec}.m3u8`,
    `${p.base}/dvr/${p.stream}/index-${startUnix}-${durSec}.m3u8`,
    `${p.base}/${p.stream}/timeshift_abs-${startUnix}.m3u8`,
    `${p.base}/${p.stream}/timeshift_rel-${offset}.m3u8`,
    `${p.base}/${p.stream}/archive.m3u8?from=${startUnix}&to=${utcEnd}`,
    `${unsigned}/${p.stream}/index-${startUnix}-${durSec}.m3u8`,
    `${unsigned}/${p.stream}/archive-${startUnix}-${durSec}.m3u8`,
    `${p.base}/${p.stream}/${p.playlist}?utc=${startUnix}&lutc=${utcNow}`,
  ];
}

interface ProbeResult {
  candidate:   string;
  status:      number | null;
  contentType: string | null;
  bodyPreview: string | null;
  isManifest:  boolean;
  hasSegments: boolean | null;
  isVod:       boolean;
  error:       string | null;
  durationMs:  number;
}

async function probe(url: string): Promise<ProbeResult> {
  const t0 = Date.now();
  try {
    const u = new URL(url);
    if (isHostBlocked(u.hostname)) {
      return blank(url, 'host blocked', t0);
    }
    const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
    if (BAD_PORTS.has(port)) return blank(url, 'port blocked', t0);
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8_000);
    let r: Response;
    try {
      r = await fetch(url, {
        method: 'GET',
        headers: {
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        },
        redirect: 'follow',
        signal: ac.signal,
      });
    } finally { clearTimeout(t); }
    const contentType = r.headers.get('content-type');
    const reader = r.body?.getReader();
    let text = '';
    if (reader) {
      const dec = new TextDecoder();
      let total = 0;
      while (total < 1024) {
        const { value, done } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        total += value.byteLength;
      }
      try { await reader.cancel(); } catch { /* ignore */ }
    }
    const isManifest  = /\.m3u8/i.test(url) || /mpegurl/i.test(contentType ?? '') || /^#EXTM3U/.test(text);
    const hasSegments = isManifest ? /#EXTINF/.test(text) : null;
    const isVod       = /#EXT-X-PLAYLIST-TYPE\s*:\s*VOD/i.test(text) || /#EXT-X-ENDLIST/i.test(text);
    return {
      candidate:   url,
      status:      r.status,
      contentType,
      bodyPreview: text.slice(0, 320),
      isManifest,
      hasSegments,
      isVod,
      error:       null,
      durationMs:  Date.now() - t0,
    };
  } catch (e) {
    return blank(url, (e as Error).message, t0);
  }
}

function blank(url: string, error: string, t0: number): ProbeResult {
  return {
    candidate:   url,
    status:      null,
    contentType: null,
    bodyPreview: null,
    isManifest:  false,
    hasSegments: null,
    isVod:       false,
    error,
    durationMs:  Date.now() - t0,
  };
}

interface ReqBody { streamUrl?: unknown; startUnix?: unknown; durationMin?: unknown }

export async function POST(req: NextRequest) {
  const kv = getKV();
  if (!kv) return NextResponse.json({ error: 'storage_unconfigured' }, { status: 503 });
  const sid = readSessionCookie(req);
  const session = sid ? await readSession(kv, sid) : null;
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: ReqBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }

  const streamUrl   = typeof body.streamUrl   === 'string' ? body.streamUrl : '';
  const startUnix   = typeof body.startUnix   === 'number' ? body.startUnix : 0;
  const durationMin = typeof body.durationMin === 'number' ? body.durationMin : 0;
  if (!/^https?:\/\//i.test(streamUrl)) return NextResponse.json({ error: 'streamUrl_invalid' }, { status: 400 });
  if (startUnix < 1_000_000_000 || startUnix > 2_500_000_000) return NextResponse.json({ error: 'startUnix_out_of_range' }, { status: 400 });
  if (durationMin < 1 || durationMin > 720) return NextResponse.json({ error: 'durationMin_out_of_range' }, { status: 400 });

  const fl = parseFlussonic(streamUrl);
  if (!fl) return NextResponse.json({ error: 'not_flussonic_shape' }, { status: 400 });

  const candidates = buildCandidates(startUnix, durationMin, fl);
  const results: ProbeResult[] = [];
  for (const c of candidates) results.push(await probe(c));

  // The verdict picks the BEST result: a 200 manifest with VOD
  // markers wins; a 200 manifest without is "silent live" and gets
  // surfaced separately so we can tell the user "this provider serves
  // live in response to archive — DVR isn't actually enabled".
  const archive = results.find((r) => r.status === 200 && r.isManifest && r.isVod);
  const live    = results.filter((r) => r.status === 200 && r.isManifest && !r.isVod);

  return NextResponse.json({
    parsed:  fl,
    results,
    verdict: {
      firstArchive:        archive ? archive.candidate : null,
      candidatesSilentLive: live.map((r) => r.candidate),
      allFailed:           !archive && live.length === 0,
    },
  }, { headers: { 'cache-control': 'no-store' } });
}
