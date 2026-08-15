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

// Per-request ceiling.
//
// The binding constraint is the platform, not us: a Workers/Pages
// invocation may issue only 50 subrequests (1000 on paid plans), and
// every upstream fetch here counts. Verifying one channel costs up to
// three — manifest, variant, segment — so a 60-item batch asked for
// 180 at minimum and blew the limit four times over. The invocation
// then failed outright, the client saw a non-ok response, discarded the
// whole batch, and recorded nothing. That is why the scan appeared to
// do nothing on its own no matter how long the page stayed open.
const MAX_ITEMS = 12;
// Hard subrequest budget, kept under the free-plan ceiling with room
// for redirects. When it runs out we return the verdicts we did reach
// instead of failing: a partial answer is real information, a thrown
// invocation is none.
const MAX_SUBREQUESTS = 42;
// Hops allowed per URL. Each one costs a subrequest.
const MAX_REDIRECTS = 3;
// How many upstream fetches run at once within a batch. Deliberately
// modest: IPTV panels routinely cap concurrent connections per account,
// and a probe burst that trips that cap would look to the provider like
// abuse and to the user like their subscription breaking.
const CONCURRENCY = 4;
// Per-FETCH, not for the whole chain. One shared 6-second budget had to
// cover manifest + variant + segment, so an ordinary slow provider blew
// it midway and the channel was recorded dead for being slow rather
// than for being absent.
const FETCH_TIMEOUT_MS = 7_000;
// Overall ceiling for one channel, so a batch cannot stall indefinitely.
const ITEM_DEADLINE_MS = 18_000;
// We only need the opening bytes to tell an HLS manifest from an error
// page, so the body read is capped instead of buffering whole playlists
// for thousands of channels.
const SNIFF_BYTES = 2048;
// Manifests get a larger read so the segment list is visible far enough
// to pick a recent entry rather than the oldest one in the window.
const MANIFEST_SNIFF_BYTES = 8192;

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
interface ProbeVerdict {
  id: string;
  /**
   * true  — the stream answered and served media.
   * false — the upstream gave a definite negative.
   * null  — no verdict. A timeout, an aborted connection, a DNS
   *         failure: these say something about latency or about our own
   *         network, and nothing at all about whether the channel
   *         exists. Treating them as "dead" is what made the scan
   *         condemn working channels for being slow, so they are
   *         reported as unknown and the client records nothing.
   */
  ok: boolean | null;
  status?: number;
}

// Fetch a URL and return its opening bytes, or null when it doesn't
// answer 2xx. Only SNIFF_BYTES are read; the rest of the stream is
// cancelled rather than buffered.
type FetchOutcome =
  | { kind: 'ok'; status: number; text: string }
  | { kind: 'refused'; status: number }   // definite negative from upstream
  | { kind: 'unknown' };                  // timeout / transport failure

async function fetchHead(
  url: string,
  headers: Record<string, string>,
  budget: { used: number },
  opts?: { extra?: Record<string, string>; maxBytes?: number },
): Promise<FetchOutcome> {
  // IPTV URLs redirect more than you would expect — a panel path hands
  // off to a load balancer which hands off to a CDN edge. Allowing only
  // one hop made safeFetch throw "too many redirects" on ordinary
  // channels, which surfaced as an unknown verdict and, because the
  // client refuses to step over an unanswered channel, wedged the sweep
  // at the first such entry. Budget for the worst case honestly.
  budget.used += MAX_REDIRECTS + 1;
  // Its own timer, so a slow first hop no longer eats the whole item's
  // allowance and fails the hops after it.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    const r = await safeFetch(
      url,
      { headers: { ...headers, ...opts?.extra } },
      { maxRedirects: MAX_REDIRECTS, signal: ac.signal },
    );
    response = r.response;
  } catch {
    // Aborted, refused, DNS failure — no information about the channel.
    return { kind: 'unknown' };
  } finally {
    clearTimeout(timer);
  }
  // 206 is a served range; 416 means the server rejected OUR range but
  // the resource is plainly there, which is a yes for our purposes.
  if (response.status === 416) {
    try { await response.body?.cancel(); } catch { /* ignore */ }
    return { kind: 'ok', status: 416, text: '' };
  }
  if (!response.ok && response.status !== 206) {
    try { await response.body?.cancel(); } catch { /* ignore */ }
    return { kind: 'refused', status: response.status };
  }
  const body = response.body;
  if (!body) return { kind: 'ok', status: response.status, text: '' };
  const cap = opts?.maxBytes ?? SNIFF_BYTES;
  const reader = body.getReader();
  let text = '';
  try {
    while (text.length < cap) {
      const { done, value } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value, { stream: true });
    }
  } catch {
    return { kind: 'unknown' };   // stream died mid-read
  } finally {
    try { await reader.cancel(); } catch { /* already closed */ }
  }
  return { kind: 'ok', status: response.status, text };
}

function looksLikeManifest(text: string): boolean {
  return /#EXTM3U/.test(text) || /#EXT-X-/.test(text);
}

// Pick a URI to follow out of a manifest.
//
// For a MASTER playlist the first variant is fine — they are all
// equivalent for a liveness question. For a MEDIA playlist we take the
// LAST segment we can see instead of the first: a live playlist is a
// sliding window, and its oldest entry may already have rolled out of
// the CDN's retention by the time we ask for it. Fetching that and
// getting a 404 says the segment expired, not that the channel is down.
function pickMediaUri(manifest: string, base: string): string | null {
  const isMaster = /#EXT-X-STREAM-INF/i.test(manifest);
  const uris: string[] = [];
  for (const raw of manifest.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    uris.push(line);
    if (isMaster) break;
  }
  // The read is truncated mid-file, so the final entry may be a partial
  // line. Prefer the one before it when there is a choice.
  const chosen = isMaster
    ? uris[0]
    : (uris.length > 1 ? uris[uris.length - 2] : uris[0]);
  if (!chosen) return null;
  try { return new URL(chosen, base).toString(); } catch { return null; }
}

async function probeOne(item: ProbeItem, budget: { used: number }): Promise<ProbeVerdict> {
  const check = validateUpstreamUrl(item.url);
  // A URL we refuse to fetch is a definite negative — it will never work.
  if ('reason' in check) return { id: item.id, ok: false };

  const headers: Record<string, string> = {
    'user-agent': safeHeaderValue(item.ua) ?? DEFAULT_UA,
  };
  const ref = safeHeaderValue(item.ref);
  if (ref) headers['referer'] = ref;

  const startedAt = Date.now();
  const outOfTime = () => Date.now() - startedAt > ITEM_DEADLINE_MS;

  try {
    const manifestUrl = check.url.toString();
    const top = await fetchHead(manifestUrl, headers, budget, { maxBytes: MANIFEST_SNIFF_BYTES });
    if (top.kind === 'unknown') return { id: item.id, ok: null };
    if (top.kind === 'refused') return { id: item.id, ok: false, status: top.status };
    if (!looksLikeManifest(top.text)) return { id: item.id, ok: false, status: top.status };

    // A served manifest is NOT proof the channel plays. Dead IPTV
    // entries very often keep answering with a well-formed playlist
    // whose segments 404, so follow through to real media.
    let mediaUrl = pickMediaUri(top.text, manifestUrl);
    if (!mediaUrl) return { id: item.id, ok: false, status: top.status };

    if (/\.m3u8(\?|$)/i.test(mediaUrl)) {
      if (outOfTime()) return { id: item.id, ok: null };
      const vCheck = validateUpstreamUrl(mediaUrl);
      if ('reason' in vCheck) return { id: item.id, ok: false };
      const variant = await fetchHead(vCheck.url.toString(), headers, budget, { maxBytes: MANIFEST_SNIFF_BYTES });
      if (variant.kind === 'unknown') return { id: item.id, ok: null };
      if (variant.kind === 'refused') return { id: item.id, ok: false, status: variant.status };
      if (!looksLikeManifest(variant.text)) return { id: item.id, ok: false, status: variant.status };
      mediaUrl = pickMediaUri(variant.text, vCheck.url.toString());
      if (!mediaUrl) return { id: item.id, ok: false, status: variant.status };
    }

    if (outOfTime()) return { id: item.id, ok: null };
    const segCheck = validateUpstreamUrl(mediaUrl);
    if ('reason' in segCheck) return { id: item.id, ok: false };
    const segUrl = segCheck.url.toString();

    // Ranged so we pull a couple of KB rather than a whole segment.
    let seg = await fetchHead(segUrl, headers, budget, {
      extra: { range: `bytes=0-${SNIFF_BYTES - 1}` },
    });
    // Some origins mishandle Range on live segments and answer with an
    // error rather than ignoring it. Give the plain request one chance
    // before calling the channel dead over our own optimisation.
    if (seg.kind === 'refused' && !outOfTime() && budget.used + 2 <= MAX_SUBREQUESTS) {
      seg = await fetchHead(segUrl, headers, budget);
    }
    if (seg.kind === 'unknown') return { id: item.id, ok: null };
    return { id: item.id, ok: seg.kind === 'ok', status: seg.status };
  } catch (e) {
    // Anything unclassified is a non-answer, not a death sentence.
    if (e instanceof SsrfBlocked) return { id: item.id, ok: false };
    return { id: item.id, ok: null };
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

  const budget = { used: 0 };
  const results: ProbeVerdict[] = [];
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      // Worst case for one channel: three URLs at MAX_REDIRECTS + 1
      // fetches each. Stop starting new work rather than being killed
      // mid-item and losing the verdicts already gathered.
      if (budget.used + 3 * (MAX_REDIRECTS + 1) > MAX_SUBREQUESTS) return;
      results.push(await probeOne(items[i], budget));
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker),
  );

  // `checked` lets the client advance its cursor by what was actually
  // answered. Advancing by the requested batch size would permanently
  // skip whatever the budget cut short.
  return NextResponse.json(
    { results, checked: results.length, requested: items.length },
    { headers: { 'cache-control': 'no-store' } },
  );
}
