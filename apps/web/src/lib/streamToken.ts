// Opaque, user-bound tokens for upstream URLs that must not reach the
// browser (provider URLs carry usernames, passwords or session tokens).
//
//   /api/stream?t=<token>
//
// The token is the upstream URL (+ the request headers the provider
// expects) sealed with secretBox, bound to the viewer's user id and an
// expiry. The proxy opens it, checks it belongs to the session that is
// asking, and fetches upstream. Segment URLs inside a manifest fetched
// this way are re-sealed the same way, so credentials never leak via
// the playlist either.

import { seal, open } from './secretBox';

export interface StreamTarget {
  url: string;
  ua?: string;
  ref?: string;
}

interface Payload extends StreamTarget { uid: string; exp: number }

const AAD = 'stream-token';
/** Long enough for a feature film paused halfway; segments of a live
 *  stream are re-issued with every manifest refresh anyway. */
export const STREAM_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

export async function sealStreamTarget(target: StreamTarget, userId: string, ttlMs = STREAM_TOKEN_TTL_MS): Promise<string> {
  const p: Payload = { url: target.url, uid: userId, exp: Date.now() + ttlMs };
  if (target.ua)  p.ua  = target.ua;
  if (target.ref) p.ref = target.ref;
  return seal(JSON.stringify(p), AAD);
}

export type OpenResult =
  | { ok: true; target: StreamTarget }
  | { ok: false; reason: 'invalid' | 'expired' | 'wrong_user' };

export async function openStreamTarget(token: string, userId: string): Promise<OpenResult> {
  const raw = await open(token, AAD);
  if (!raw) return { ok: false, reason: 'invalid' };
  let p: Payload;
  try { p = JSON.parse(raw) as Payload; } catch { return { ok: false, reason: 'invalid' }; }
  if (typeof p.url !== 'string' || typeof p.uid !== 'string' || typeof p.exp !== 'number') {
    return { ok: false, reason: 'invalid' };
  }
  if (p.uid !== userId) return { ok: false, reason: 'wrong_user' };
  if (Date.now() > p.exp) return { ok: false, reason: 'expired' };
  return { ok: true, target: { url: p.url, ua: p.ua, ref: p.ref } };
}
