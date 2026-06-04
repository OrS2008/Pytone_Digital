// POST /api/admin/catchup-probe
//
// Diagnostic for the catch-up URL builder. Given a live stream URL +
// a target start time + duration, we generate every candidate URL
// our catchup module would try and report what the upstream actually
// returns for each:
//
//   { url, status, contentType, bodyPreview, error }
//
// The operator runs this from the admin "Catchup Probe" tab to figure
// out which URL shape the provider's panel actually supports, without
// having to read network logs in the player or guess from the M3U.
//
// Request body:
//   { streamUrl: string, startUnix: number, durationMin: number }
//
// SSRF guards mirror /api/stream — private IP / metadata hostnames
// and dangerous ports are refused.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminGuard';

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

// Same parser shape as lib/catchup.ts — we deliberately don't import
// from there because the admin probe will diverge over time (it does
// not need to skip "live-shaped" URLs and it cares about MORE
// candidate variants, not fewer).
interface FlussonicParts { base: string; stream: string; playlist: string; }

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

function buildFlussonicCandidates(startUnix: number, durationMin: number, p: FlussonicParts): string[] {
  const durSec  = durationMin * 60;
  const utcEnd  = startUnix + durSec;
  const utcNow  = Math.floor(Date.now() / 1000);
  const offset  = Math.max(0, utcNow - startUnix);
  const unsigned = p.base.replace(/\/s\/[^/]+(?=$|\/)/, '');

  return [
    `${p.base}/${p.stream}/index-${startUnix}-${durSec}.m3u8`,
    `${p.base}/${p.stream}/${p.playlist.replace(/\.m3u8$/i, '')}-${startUnix}-${durSec}.m3u8`,
    `${p.base}/${p.stream}/archive-${startUnix}-${durSec}.m3u8`,
    `${p.base}/${p.stream}/timeshift_abs-${startUnix}.m3u8`,
    `${p.base}/${p.stream}/timeshift_rel-${offset}.m3u8`,
    `${p.base}/${p.stream}/archive.m3u8?from=${startUnix}&to=${utcEnd}`,
    `${unsigned}/${p.stream}/index-${startUnix}-${durSec}.m3u8`,
    `${unsigned}/${p.stream}/archive-${startUnix}-${durSec}.m3u8`,
    `${p.base}/${p.stream}/${p.playlist}?utc=${startUnix}&lutc=${utcNow}`,
  ];
}

interface ProbeResult {
  candidate:    string;
  status:       number | null;
  contentType:  string | null;
  bodyPreview:  string | null;
  isManifest:   boolean;
  hasSegments:  boolean | null;   // true when manifest has #EXTINF lines
  error:        string | null;
  durationMs:   number;
}

async function probe(url: string): Promise<ProbeResult> {
  const t0 = Date.now();
  try {
    const u = new URL(url);
    if (isHostBlocked(u.hostname)) {
      return { candidate: url, status: null, contentType: null, bodyPreview: null, isManifest: false, hasSegments: null, error: 'host blocked (private / metadata)', durationMs: Date.now() - t0 };
    }
    const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
    if (BAD_PORTS.has(port)) {
      return { candidate: url, status: null, contentType: null, bodyPreview: null, isManifest: false, hasSegments: null, error: 'port blocked', durationMs: Date.now() - t0 };
    }
    const ac = new AbortController();
    const t  = setTimeout(() => ac.abort(), 8_000);
    let r: Response;
    try {
      r = await fetch(url, {
        method: 'GET',
        headers: { 'user-agent': 'Nova Stream/1.0 (catchup-probe)' },
        redirect: 'follow',
        signal: ac.signal,
      });
    } finally { clearTimeout(t); }

    const contentType = r.headers.get('content-type');
    // Read only the first 1 KB — enough to tell if it's an HLS manifest
    // and what the first lines look like.
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

    return {
      candidate:   url,
      status:      r.status,
      contentType,
      bodyPreview: text.slice(0, 320),
      isManifest,
      hasSegments,
      error:       null,
      durationMs:  Date.now() - t0,
    };
  } catch (e) {
    return {
      candidate:   url,
      status:      null,
      contentType: null,
      bodyPreview: null,
      isManifest:  false,
      hasSegments: null,
      error:       (e as Error).message,
      durationMs:  Date.now() - t0,
    };
  }
}

interface ReqBody { streamUrl?: unknown; startUnix?: unknown; durationMin?: unknown }

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;

  let body: ReqBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }

  const streamUrl   = typeof body.streamUrl   === 'string' ? body.streamUrl : '';
  const startUnix   = typeof body.startUnix   === 'number' ? body.startUnix : 0;
  const durationMin = typeof body.durationMin === 'number' ? body.durationMin : 0;

  if (!/^https?:\/\//i.test(streamUrl))           return NextResponse.json({ error: 'streamUrl must be http(s)://' }, { status: 400 });
  if (startUnix < 1_000_000_000 || startUnix > 2_500_000_000) return NextResponse.json({ error: 'startUnix must be a unix epoch in seconds' }, { status: 400 });
  if (durationMin < 1 || durationMin > 720)       return NextResponse.json({ error: 'durationMin must be 1..720' }, { status: 400 });

  const fl = parseFlussonic(streamUrl);
  if (!fl) {
    return NextResponse.json({
      error: 'not_recognised',
      hint:  'Probe currently supports Flussonic-shaped URLs only (/.../<stream>/video.m3u8 or /.../<stream>/index.m3u8).',
    }, { status: 400 });
  }

  const candidates = buildFlussonicCandidates(startUnix, durationMin, fl);
  const results: ProbeResult[] = [];
  for (const c of candidates) results.push(await probe(c));

  // Bucket so the UI can render a quick verdict.
  const ok   = results.find((r) => r.status === 200 && r.isManifest && r.hasSegments);
  const live = results.filter((r) => r.status === 200 && r.isManifest && !r.hasSegments);
  return NextResponse.json({
    streamUrl,
    startUnix,
    durationMin,
    parsed:    fl,
    results,
    verdict: {
      firstWorking:        ok ? ok.candidate : null,
      candidatesLikelyLive: live.map((r) => r.candidate),
    },
  }, { headers: { 'cache-control': 'no-store' } });
}
