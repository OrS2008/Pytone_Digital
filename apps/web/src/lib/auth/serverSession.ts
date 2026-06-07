// Server-side session lookup + cookie helpers.
//
// Session model: a random 32-byte token (base64url) lives in an
// HTTP-only Secure SameSite=Strict cookie. Two KV writes per session:
//
//   session:<id>                     → JSON SessionRecord  (TTL 30d)
//   user_sessions:<userId>:<id>      → "1"                  (TTL 30d)
//
// The first lookup powers auth (cookie → userId). The second key
// indexes sessions per user so we can list "which devices are signed
// in" and revoke them one-by-one. Both keys share the same TTL, so
// the index never points at a session that no longer exists.
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
  // Captured at session-create time for the Devices screen. Optional
  // because older sessions written before this field was added don't
  // have it — the UI shows "—" in that case rather than crashing.
  userAgent?: string;
  ip?:        string;
}

function sessionKey(id: string): string { return `session:${id}`; }
function indexKey(userId: string, id: string): string {
  return `user_sessions:${userId}:${id}`;
}
function indexPrefix(userId: string): string {
  return `user_sessions:${userId}:`;
}

export async function createSession(
  kv: KVNamespace,
  userId: string,
  email: string,
  meta?: { userAgent?: string; ip?: string },
): Promise<string> {
  const id = randomId();
  const record: SessionRecord = {
    userId,
    email,
    createdAt: Date.now(),
    userAgent: meta?.userAgent,
    ip:        meta?.ip,
  };
  await Promise.all([
    kv.put(sessionKey(id), JSON.stringify(record), { expirationTtl: SESSION_TTL_SEC }),
    kv.put(indexKey(userId, id), '1',              { expirationTtl: SESSION_TTL_SEC }),
  ]);
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
  // Read first so we know which userId index entry to clear.
  const session = await readSession(kv, id);
  await Promise.allSettled([
    kv.delete(sessionKey(id)),
    session ? kv.delete(indexKey(session.userId, id)) : Promise.resolve(),
  ]);
}

// List every session id currently active for a user. Paginates
// internally via KV's list cursor; for "single user with N devices"
// the result is usually <50 keys so one page is enough.
export async function listSessionsForUser(kv: KVNamespace, userId: string): Promise<string[]> {
  if (!kv.list) return [];
  const ids: string[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 8; i++) {
    const page = await kv.list({ prefix: indexPrefix(userId), cursor, limit: 1000 });
    const prefixLen = indexPrefix(userId).length;
    for (const key of page.keys) {
      ids.push(key.name.slice(prefixLen));
    }
    if (page.list_complete) break;
    cursor = page.cursor;
  }
  return ids;
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
