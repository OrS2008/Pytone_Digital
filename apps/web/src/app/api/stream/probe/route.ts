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

// Fetch a URL and return its opening bytes, or null when it doesn't
// answer 2xx. Only SNIFF_BYTES are read; the rest of the stream is
// cancelled rather than buffered.
async function fetchHead(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  extra?: Record<string, string>,
): Promise<{ status: number; text: string } | null> {
  const { response } = await safeFetch(
    url,
    { headers: { ...headers, ...extra } },
    { maxRedirects: 3, signal },
  );
  if (!response.ok && response.status !== 206) {
    try { await response.body?.cancel(); } catch { /* ignore */ }
    return null;
  }
  const body = response.body;
  if (!body) return { status: response.status, text: '' };
  const reader = body.getReader();
  let text = '';
  try {
    while (text.length < SNIFF_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value, { stream: true });
    }
  } finally {
    try { await reader.cancel(); } catch { /* already closed */ }
  }
  return { status: response.status, text };
}

function looksLikeManifest(text: string): boolean {
  return /#EXTM3U/.test(text) || /#EXT-X-/.test(text);
}

// First playable URI in a manifest: the first line that isn't blank and
// isn't a tag. In a master playlist that's a variant .m3u8; in a media
// playlist it's a segment.
function firstMediaUri(manifest: string, base: string): string | null {
  for (const raw of manifest.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    try { return new URL(line, base).toString(); } catch { return null; }
  }
  return null;
}

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
    const manifestUrl = check.url.toString();
    const top = await fetchHead(manifestUrl, headers, ac.signal);
    if (!top || !looksLikeManifest(top.text)) {
      return { id: item.id, ok: false, status: top?.status };
    }

    // A served manifest is NOT proof the channel plays. Dead IPTV
    // entries very often keep answering with a perfectly well-formed
    // playlist whose segments 404 — they pass a manifest-only check and
    // then fail the moment the player asks for media. Follow the first
    // URI (through one level of master → variant) and confirm the media
    // itself is really there, so the scan reaches the same verdict the
    // player would.
    let mediaUrl = firstMediaUri(top.text, manifestUrl);
    if (!mediaUrl) return { id: item.id, ok: false, status: top.status };

    if (/\.m3u8(\?|$)/i.test(mediaUrl)) {
      const variantCheck = validateUpstreamUrl(mediaUrl);
      if ('reason' in variantCheck) return { id: item.id, ok: false };
      const variant = await fetchHead(variantCheck.url.toString(), headers, ac.signal);
      if (!variant || !looksLikeManifest(variant.text)) {
        return { id: item.id, ok: false, status: variant?.status };
      }
      mediaUrl = firstMediaUri(variant.text, variantCheck.url.toString());
      if (!mediaUrl) return { id: item.id, ok: false, status: variant.status };
    }

    const segCheck = validateUpstreamUrl(mediaUrl);
    if ('reason' in segCheck) return { id: item.id, ok: false };
    // Ranged so we pull a couple of KB rather than a whole segment —
    // across a 12k playlist the difference is gigabytes.
    const seg = await fetchHead(segCheck.url.toString(), headers, ac.signal, {
      range: `bytes=0-${SNIFF_BYTES - 1}`,
    });
    return { id: item.id, ok: !!seg, status: seg?.status ?? top.status };
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
