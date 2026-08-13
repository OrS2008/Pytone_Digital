// POST /api/stream/probe — batch liveness check for playlist entries.
//
// The dead-channel detector used to probe one channel per browser
// request through /api/stream. That is unusable at real playlist size:
// at ~12.7k channels it needs 12.7k round trips, and the manifest body
// comes back over the wire every time only to be thrown away after a
// regex test. Checking a slice of 25 every five minutes — the shape
// that fit inside that budget — takes over forty hours to cover one
// playlist once.
//
// Here the browser hands us a batch and we do the fan-out at the edge,
// where the requests are already next to the network. One HTTP request
// covers MAX_ITEMS channels, and the response is a verdict list rather
// than a pile of manifests, so a full playlist pass costs the client a
// couple of hundred small requests instead of twelve thousand large
// ones.
//
// Request:  { items: [{ id, url, ua?, ref? }, ...] }
// Response: { results: [{ id, ok, status? }, ...] }
//
// What "ok" means: the upstream answered 2xx AND the first bytes look
// like an HLS manifest. Status alone is not enough — dead IPTV edges
// commonly answer 200 with an HTML error page.
//
// Guards: same origin gate and the same SSRF validation as /api/stream.
// A caller cannot use this to port-scan a private network, and cannot
// use it to pull data either: the response carries a boolean per item,
// never any part of the body.

import { NextRequest, NextResponse } from 'next/server';
import { validateUpstreamUrl, safeFetch, SsrfBlocked } from '@/lib/ssrfGuard';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Per-request ceiling. Keeps one call's fan-out bounded regardless of
// what the client asks for.
const MAX_ITEMS = 60;
// How many upstream fetches run at once within a batch. Deliberately
// modest: IPTV panels routinely cap concurrent connections per account,
// and a probe burst that trips that cap would look to the provider like
// abuse and to the user like their subscription breaking.
const CONCURRENCY = 6;
const PROBE_TIMEOUT_MS = 6_000;
// We only need the opening bytes to tell an HLS manifest from an error
// page, so the body read is capped instead of buffering whole playlists
// for thousands of channels.
const SNIFF_BYTES = 2048;

function isAllowedCaller(req: NextRequest): boolean {
  const ref = req.headers.get('origin') || req.headers.get('referer') || '';
  if (!ref) return false;
  let refHost: string;
  try { refHost = new URL(ref).host; } catch { return false; }
  if (refHost === (req.headers.get('host') || '')) return true;
  const extra = (process.env.ALLOWED_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return extra.includes(refHost);
}

// Header values become outbound headers, so they are sanitised exactly
// as in /api/stream rather than trusted.
function safeHeaderValue(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v || v.length > 512) return null;
  if (/[\r\n\0]/.test(v)) return null;
  if (!/^[\t\x20-\x7e]+$/.test(v)) return null;
  return v;
}

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

interface ProbeItem { id: string; url: string; ua?: unknown; ref?: unknown }
interface ProbeVerdict { id: string; ok: boolean; status?: number }

async function probeOne(item: ProbeItem): Promise<ProbeVerdict> {
  const check = validateUpstreamUrl(item.url);
  if ('reason' in check) return { id: item.id, ok: false };

  const headers: Record<string, string> = {
    'user-agent': safeHeaderValue(item.ua) ?? DEFAULT_UA,
  };
  const ref = safeHeaderValue(item.ref);
  if (ref) headers['referer'] = ref;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS);
  try {
    const { response } = await safeFetch(
      check.url.toString(),
      { headers },
      { maxRedirects: 3, signal: ac.signal },
    );
    if (!response.ok) return { id: item.id, ok: false, status: response.status };

    const body = response.body;
    if (!body) return { id: item.id, ok: false, status: response.status };

    // Read only the opening chunk, then drop the rest.
    const reader = body.getReader();
    let sniff = '';
    try {
      while (sniff.length < SNIFF_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        sniff += new TextDecoder().decode(value, { stream: true });
      }
    } finally {
      try { await reader.cancel(); } catch { /* already closed */ }
    }
    const ok = /#EXTM3U/.test(sniff) || /#EXT-X-/.test(sniff);
    return { id: item.id, ok, status: response.status };
  } catch (e) {
    if (e instanceof SsrfBlocked) return { id: item.id, ok: false };
    return { id: item.id, ok: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  if (!isAllowedCaller(req)) return new Response('forbidden', { status: 403 });

  let body: { items?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }

  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: 'items_required' }, { status: 400 });
  }

  const items: ProbeItem[] = [];
  for (const raw of body.items.slice(0, MAX_ITEMS)) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.url !== 'string') continue;
    if (!o.id || !o.url) continue;
    items.push({ id: o.id, url: o.url, ua: o.ua, ref: o.ref });
  }
  if (items.length === 0) return NextResponse.json({ results: [] });

  const results: ProbeVerdict[] = [];
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results.push(await probeOne(items[i]));
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker),
  );

  return NextResponse.json(
    { results },
    { headers: { 'cache-control': 'no-store' } },
  );
}
