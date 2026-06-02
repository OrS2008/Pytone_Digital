// Server-side session lookup + cookie helpers.
//
// Session model: a random 32-byte token (base64url) lives in an
// HTTP-only Secure SameSite=Strict cookie. The same token is the key
// to a KV entry that carries the userId + email + expiry. KV's TTL
// expires both sides in lockstep so we never have a stale cookie
// pointing at an evicted session record.
//
// Why HTTP-only: JS in the page can never read the token, so XSS
// can't ship the cookie to an attacker's server. Why SameSite=Strict:
// other origins can never trigger a logged-in request, which is the
// CSRF defence (combined with same-origin API routes).

import type { NextRequest } from 'next/server';
import type { KVNamespace } from '../cfEnv';
import { randomId } from './password';

export const SESSION_COOKIE   = 'ns_session';
export const SESSION_DAYS     = 30;
const SESSION_TTL_SEC         = SESSION_DAYS * 24 * 60 * 60;

export interface SessionRecord {
  userId:    string;
  email:     string;
  createdAt: number;
}

function sessionKey(id: string): string { return `session:${id}`; }

export async function createSession(kv: KVNamespace, userId: string, email: string): Promise<string> {
  const id = randomId();
  const record: SessionRecord = { userId, email, createdAt: Date.now() };
  await kv.put(sessionKey(id), JSON.stringify(record), { expirationTtl: SESSION_TTL_SEC });
  return id;
}

export async function readSession(kv: KVNamespace, id: string): Promise<SessionRecord | null> {
  if (!id) return null;
  const raw = await kv.get(sessionKey(id));
  if (!raw) return null;
  try { return JSON.parse(raw) as SessionRecord; } catch { return null; }
}

export async function destroySession(kv: KVNamespace, id: string): Promise<void> {
  if (!id) return;
  await kv.delete(sessionKey(id));
}

// Read the session id from the cookie header without going through
// NextRequest.cookies — that helper exists but we keep this
// dependency-free for use in handlers that already have a Request.
export function readSessionCookie(req: NextRequest | Request): string {
  const raw = req.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join('='));
  }
  return '';
}

// Cookie-set / clear builders. We emit them as strings so the API
// routes can attach multiple Set-Cookie headers on a single Response
// (NextResponse.cookies works, but the string form is easier to read
// and exactly mirrors the wire format).
export function setSessionCookieHeader(id: string): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(id)}`,
    'Path=/',
    `Max-Age=${SESSION_TTL_SEC}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ');
}

export function clearSessionCookieHeader(): string {
  return [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ');
}
