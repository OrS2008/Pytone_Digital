// Hardened SSRF guard shared by every URL-proxying route
// (/api/stream, /api/m3u, /api/epg, /api/playlist/digest).
//
// The previous per-route guard had two exploitable gaps:
//
//   1. It matched the hostname STRING against a regex blocklist, so
//      alternate IP encodings slipped straight through:
//        http://2130706433/        (decimal  127.0.0.1)
//        http://0x7f000001/         (hex      127.0.0.1)
//        http://0177.0.0.1/         (octal    127.0.0.1)
//        http://[0:0:0:0:0:0:0:1]/  (expanded ::1)
//      and a hostname that DNS-resolves to a private IP (rebinding).
//
//   2. It used `redirect: 'follow'`, so a URL on an allowed host could
//      302 to http://169.254.169.254/ (cloud metadata) and the guard
//      — which only checked the first URL — never saw the redirect
//      target.
//
// This module normalises the host into a canonical IP where possible,
// blocks every private / reserved / link-local / metadata range, and
// exposes safeFetch() which follows redirects MANUALLY, re-validating
// each hop's Location against the same guard.

const BAD_PORTS = new Set([
  22, 23, 25, 53, 110, 143, 389, 445, 465, 587, 636, 993, 995,
  1433, 1521, 2049, 3306, 3389, 5432, 5900, 6379, 9200, 9300, 11211, 27017, 27018,
]);

// Hostnames that are never legitimate upstreams.
const BLOCKED_NAME = [
  /^localhost$/i,
  /\.localhost$/i,
  /^metadata$/i, /^metadata\./i,
  /^instance-data$/i, /^instance-data\./i,
  /\.internal$/i, /\.local$/i,
];

// Decode an IPv4 in decimal / hex / octal / dotted-mixed form into the
// canonical "a.b.c.d" string, or null if it isn't an IPv4 literal.
// Mirrors how libc inet_aton (and therefore most fetch stacks) parses
// these, which is the whole reason they're a bypass vector.
function canonicaliseIPv4(host: string): string | null {
  const h = host.trim();
  if (!h) return null;

  // Pure decimal integer: 2130706433 -> 127.0.0.1
  if (/^\d+$/.test(h)) {
    const n = Number(h);
    if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) return null;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  }
  // Pure hex integer: 0x7f000001
  if (/^0x[0-9a-f]+$/i.test(h)) {
    const n = parseInt(h, 16);
    if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) return null;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  }

  // Dotted form where each octet may be decimal, hex, or octal.
  const parts = h.split('.');
  if (parts.length < 1 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    let v: number;
    if (/^0x[0-9a-f]+$/i.test(p))      v = parseInt(p, 16);
    else if (/^0[0-7]+$/.test(p))      v = parseInt(p, 8);
    else if (/^\d+$/.test(p))          v = parseInt(p, 10);
    else return null;
    if (!Number.isInteger(v) || v < 0) return null;
    nums.push(v);
  }
  // Standard 4-octet dotted quad.
  if (nums.length === 4 && nums.every((n) => n <= 255)) {
    return nums.join('.');
  }
  return null;
}

// True when a canonical "a.b.c.d" IPv4 is in a private / reserved /
// loopback / link-local / CGNAT range we must never proxy to.
function isPrivateIPv4(ip: string): boolean {
  const o = ip.split('.').map(Number);
  if (o.length !== 4 || o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true; // malformed → refuse
  const [a, b] = o;
  if (a === 0)                       return true; // 0.0.0.0/8
  if (a === 10)                      return true; // 10/8
  if (a === 127)                     return true; // loopback
  if (a === 169 && b === 254)        return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168)        return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 192 && b === 0)          return true; // 192.0.0/24 + 192.0.2/24 test
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
  if (a >= 224)                      return true; // multicast + reserved 224+
  return false;
}

// Normalise + classify an IPv6 literal (already stripped of brackets).
function isPrivateIPv6(host: string): boolean {
  const h = host.toLowerCase();
  // Loopback ::1 in any zero-compressed / expanded form.
  if (h === '::1' || /^(0+:){7}0*1$/.test(h)) return true;
  if (h === '::' || /^0*(:0+)*$/.test(h))      return true; // unspecified
  if (/^fe80:/.test(h))                        return true; // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(h))            return true; // unique-local fc00::/7
  // IPv4-mapped / -compatible: ::ffff:a.b.c.d or ::ffff:7f00:1
  const mapped = /^::ffff:(.+)$/.exec(h) || /^::(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  if (mapped) {
    const inner = mapped[1];
    if (/^\d+\.\d+\.\d+\.\d+$/.test(inner)) return isPrivateIPv4(inner);
    // hex-packed ::ffff:7f00:0001 → reconstruct dotted quad
    const hx = inner.replace(/:/g, '');
    if (/^[0-9a-f]{1,8}$/.test(hx)) {
      const n = parseInt(hx, 16);
      return isPrivateIPv4([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'));
    }
  }
  return false;
}

// Validate a single URL. Returns the parsed URL when safe, or a string
// reason when it must be refused.
export function validateUpstreamUrl(target: string): { url: URL } | { reason: string } {
  let u: URL;
  try { u = new URL(target); } catch { return { reason: 'invalid url' }; }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { reason: 'only http / https allowed' };
  }
  // Reject embedded credentials — http://allowed@169.254.169.254/ tricks
  // naive host parsing and is never needed for a public playlist.
  if (u.username || u.password) return { reason: 'credentials in URL not allowed' };

  // Strip brackets + trailing dot off the host for classification.
  let host = u.hostname.replace(/\.$/, '');
  const isBracketed = host.startsWith('[') && host.endsWith(']');
  if (isBracketed) host = host.slice(1, -1);

  // Named-host blocklist (localhost, *.internal, metadata, …)
  if (BLOCKED_NAME.some((rx) => rx.test(host))) {
    return { reason: 'refused: blocked hostname' };
  }

  // IPv6 literal?
  if (host.includes(':')) {
    if (isPrivateIPv6(host)) return { reason: 'refused: private IPv6' };
  } else {
    // Try to canonicalise as IPv4 (catches decimal/hex/octal encodings).
    const canon = canonicaliseIPv4(host);
    if (canon) {
      if (isPrivateIPv4(canon)) return { reason: 'refused: private / reserved IPv4' };
    }
    // If it's NOT an IP literal it's a DNS name — we can't resolve it
    // on the edge before fetch, so DNS-rebinding to a private IP is a
    // residual risk. The redirect-validating safeFetch below limits the
    // blast radius; a full fix needs resolve-then-pin which the Workers
    // runtime doesn't expose. Named hosts that look like our own infra
    // are already caught by BLOCKED_NAME.
  }

  const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
  if (BAD_PORTS.has(port)) return { reason: 'refused: blocked port' };

  return { url: u };
}

// DNS-rebinding mitigation. validateUpstreamUrl() can only classify IP
// LITERALS — a hostname like evil.com that resolves to 169.254.169.254
// passes the string check, then fetch() dials the private IP. The
// Workers runtime won't let us pin fetch to a pre-resolved IP, but we
// CAN resolve the name ourselves via Cloudflare's DNS-over-HTTPS JSON
// API and refuse when any answer is a private / reserved address. This
// catches static private-IP DNS records outright and narrows a true
// rebinding attack to a small TOCTOU window. Best-effort: a DoH failure
// does NOT block the request, it falls back to the literal check.
// Per-host verdict cache. An HLS stream pulls many segments through
// /api/stream, each of which re-enters safeFetch; without caching we'd
// DoH-resolve the same CDN host on every segment and tank playback
// latency. 60 s TTL is short enough that a rebinding flip is still
// caught on the next window but long enough to keep streaming smooth.
const dohCache = new Map<string, { private: boolean; at: number }>();
const DOH_TTL_MS = 60_000;

async function dohResolvesToPrivate(hostname: string): Promise<boolean> {
  if (/^[\d.]+$/.test(hostname) || hostname.includes(':')) return false; // IP literal — already checked

  const cached = dohCache.get(hostname);
  if (cached && Date.now() - cached.at < DOH_TTL_MS) return cached.private;

  let isPriv = false;
  try {
    // Resolve A + AAAA in parallel — serial doubled the latency.
    const [a, aaaa] = await Promise.all(['A', 'AAAA'].map(async (type) => {
      const r = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
        { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(2500) },
      );
      if (!r.ok) return [] as Array<{ type: number; data: string }>;
      const j = await r.json() as { Answer?: Array<{ type: number; data: string }> };
      return j.Answer ?? [];
    }));
    for (const ans of [...a, ...aaaa]) {
      if (ans.type === 1  && isPrivateIPv4(ans.data)) { isPriv = true; break; } // A
      if (ans.type === 28 && isPrivateIPv6(ans.data)) { isPriv = true; break; } // AAAA
    }
    dohCache.set(hostname, { private: isPriv, at: Date.now() });
  } catch { /* DoH failed — don't block, don't cache */ }
  return isPriv;
}

// fetch() that follows redirects MANUALLY, re-validating each hop so a
// 3xx to an internal host can't smuggle past the initial check, and
// DoH-resolving each hostname to catch DNS rebinding. Throws
// SsrfBlocked when any hop is refused.
export class SsrfBlocked extends Error {
  constructor(public reason: string) { super(`SSRF blocked: ${reason}`); this.name = 'SsrfBlocked'; }
}

export interface SafeFetchResult {
  response: Response;
  /** The URL of the FINAL hop after following redirects. Callers that
   *  rewrite a manifest must use this as the base — relative segment
   *  URLs resolve against where the body actually came from, not the
   *  original request URL. */
  finalUrl: string;
}

export async function safeFetch(
  initialUrl: string,
  init: RequestInit,
  opts: { maxRedirects?: number; signal?: AbortSignal } = {},
): Promise<SafeFetchResult> {
  const max = opts.maxRedirects ?? 4;
  let current = initialUrl;
  for (let hop = 0; hop <= max; hop++) {
    const check = validateUpstreamUrl(current);
    if ('reason' in check) throw new SsrfBlocked(check.reason);

    // DNS-rebinding check on the (named) host before we dial it.
    if (await dohResolvesToPrivate(check.url.hostname)) {
      throw new SsrfBlocked('refused: hostname resolves to a private address');
    }

    const res = await fetch(check.url.toString(), {
      ...init,
      redirect: 'manual',
      signal: opts.signal ?? init.signal,
    });

    // 3xx with a Location → validate the next hop ourselves.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return { response: res, finalUrl: check.url.toString() };
      // Resolve relative redirects against the current URL.
      current = new URL(loc, check.url).toString();
      continue;
    }
    return { response: res, finalUrl: check.url.toString() };
  }
  throw new SsrfBlocked('too many redirects');
}
