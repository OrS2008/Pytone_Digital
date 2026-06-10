// KV-backed fixed-window rate limiter for auth endpoints.
//
// The per-isolate Map limiter the admin login used is useless on
// Cloudflare's multi-isolate fan-out — each colo / isolate keeps its
// own counter, so an attacker hitting different edges resets it for
// free. This limiter stores the counter in KV (shared across isolates)
// keyed by a caller fingerprint, so the budget is global.
//
// Fixed-window (not sliding) is deliberate: it's one KV read + one KV
// write per request, cheap enough for the login path, and good enough
// to stop online brute force / email bombing. The window resets hard
// every `windowSec`, which is fine for abuse control.

import type { KVNamespace } from './cfEnv';

export interface RateLimitResult {
  ok:        boolean;
  remaining: number;
  retryAfter: number; // seconds until the window resets (0 when ok)
}

// Returns ok:false once `max` hits land inside `windowSec`. `bucket`
// namespaces the limit (e.g. 'login', 'forgot') so different endpoints
// don't share a counter. `id` is the caller fingerprint — pass the
// client IP, optionally combined with the email being targeted.
export async function rateLimit(
  kv: KVNamespace,
  bucket: string,
  id: string,
  max: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / windowSec);
  const key = `rl:${bucket}:${id}:${window}`;
  let count = 0;
  try {
    const raw = await kv.get(key);
    count = raw ? parseInt(raw, 10) || 0 : 0;
  } catch { /* KV read failed — fail open so a KV hiccup can't lock everyone out */ return { ok: true, remaining: max, retryAfter: 0 }; }

  if (count >= max) {
    const resetAt = (window + 1) * windowSec;
    return { ok: false, remaining: 0, retryAfter: Math.max(1, resetAt - now) };
  }

  // Bump the counter. TTL a little past the window so the key self-cleans.
  try {
    await kv.put(key, String(count + 1), { expirationTtl: windowSec + 5 });
  } catch { /* write failure — allow the request, don't hard-fail auth */ }

  return { ok: true, remaining: max - count - 1, retryAfter: 0 };
}

// Best-effort caller fingerprint: Cloudflare's trusted client IP, with
// a fallback so we still bucket *something* when it's absent.
export function callerIp(req: Request): string {
  return req.headers.get('cf-connecting-ip')
      || req.headers.get('x-real-ip')
      || 'unknown';
}

export function tooManyRequests(retryAfter: number): Response {
  return new Response(
    JSON.stringify({ error: 'rate_limited', retryAfter }),
    { status: 429, headers: { 'content-type': 'application/json', 'retry-after': String(retryAfter) } },
  );
}
