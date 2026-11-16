// Server-side gate for every route that fetches IPTV content on the
// caller's behalf (/api/stream, /api/m3u, /api/epg, /api/stream/probe,
// /api/playlist/digest, /api/providers/*).
//
// These routes used to check only that the Referer/Origin header named
// our own host — a header any script can set — so anyone could use the
// deployment as a free, anonymous streaming proxy, and the trial was
// enforced only by a client-side overlay.
//
// Now a caller must present a valid session cookie for an account whose
// trial or subscription is active. Decisions:
//
//   * fail CLOSED: no KV binding, or a KV error, means 503 — never "let
//     it through".
//   * a short per-isolate cache (60 s) so the dozens of segment requests
//     a player makes per minute do not each cost two KV reads. A revoked
//     session or an expired trial therefore takes effect within a minute.
//   * optional per-account rate limit for the expensive, non-segment
//     routes (playlist / EPG / provider API calls).

import { NextResponse } from 'next/server';
import { getKV, type KVNamespace } from './cfEnv';
import { readSession, readSessionCookie } from './auth/serverSession';
import { accessState, findUserByEmail, type AccessState } from './auth/users';
import { rateLimit } from './rateLimit';

export interface Viewer {
  userId: string;
  email:  string;
  access: AccessState['status'];
  kv:     KVNamespace;
}

interface CacheEntry { at: number; viewer: Omit<Viewer, 'kv'> | null; code: 401 | 402 }
const CACHE = new Map<string, CacheEntry>();
const CACHE_MS = 60_000;
const CACHE_MAX = 5_000;

export interface ViewerOptions {
  /** Per-account request budget: `max` requests per `windowSec`. */
  limit?: { bucket: string; max: number; windowSec: number };
}

function deny(status: 401 | 402 | 429 | 503, error: string, extra: Record<string, unknown> = {}): Response {
  return NextResponse.json({ error, ...extra }, {
    status,
    headers: status === 429 && extra.retryAfter ? { 'retry-after': String(extra.retryAfter) } : undefined,
  });
}

/** Test hook: drop cached decisions (e.g. after changing KV state). */
export function clearViewerCache(): void { CACHE.clear(); }

export async function requireViewer(req: Request, opts: ViewerOptions = {}): Promise<Viewer | Response> {
  const kv = getKV();
  if (!kv) return deny(503, 'storage_unconfigured');

  const sid = readSessionCookie(req);
  if (!sid) return deny(401, 'sign_in_required');

  const now = Date.now();
  let entry = CACHE.get(sid);
  if (!entry || now - entry.at > CACHE_MS) {
    try {
      const session = await readSession(kv, sid);
      const user = session ? await findUserByEmail(kv, session.email) : null;
      if (!session || !user || user.userId !== session.userId) {
        entry = { at: now, viewer: null, code: 401 };
      } else {
        const state = accessState(user, now);
        entry = state.status === 'expired'
          ? { at: now, viewer: null, code: 402 }
          : { at: now, viewer: { userId: user.userId, email: user.email, access: state.status }, code: 401 };
      }
    } catch {
      return deny(503, 'storage_unavailable');
    }
    if (CACHE.size >= CACHE_MAX) CACHE.clear();
    CACHE.set(sid, entry);
  }

  if (!entry.viewer) {
    return entry.code === 402
      ? deny(402, 'access_expired', { message: 'Your free trial has ended. Subscribe to keep watching.' })
      : deny(401, 'sign_in_required');
  }

  if (opts.limit) {
    const rl = await rateLimit(kv, opts.limit.bucket, entry.viewer.userId, opts.limit.max, opts.limit.windowSec);
    if (!rl.ok) return deny(429, 'rate_limited', { retryAfter: rl.retryAfter });
  }
  return { ...entry.viewer, kv };
}
