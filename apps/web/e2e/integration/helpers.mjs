// Shared plumbing for the API integration tests.
//
// The real route handlers from src/app/api run in Node with:
//   * an in-memory KV namespace (MemoryKV) as the NOVA_KV binding,
//   * a scripted global fetch, so Stripe, Google, DNS-over-HTTPS and
//     IPTV providers are answered locally and every outbound request is
//     recorded for assertions.
//
// Nothing here talks to the network.

import { webcrypto } from 'node:crypto';

export const TEST_KEY = Buffer.alloc(32, 7).toString('base64');
export const OTHER_KEY = Buffer.alloc(32, 9).toString('base64');

export class MemoryKV {
  constructor() { this.map = new Map(); this.failing = false; this.reads = 0; this.writes = 0; }
  #check() { if (this.failing) throw new Error('KV unavailable'); }
  async get(k) { this.#check(); this.reads++; const e = this.map.get(k); if (!e) return null; if (e.exp && e.exp < Date.now()) { this.map.delete(k); return null; } return e.v; }
  async put(k, v, o = {}) {
    this.#check(); this.writes++;
    if (o.expirationTtl !== undefined && o.expirationTtl < 60) throw new Error('KV PUT failed: 400 Invalid expiration_ttl (minimum 60)');
    this.map.set(k, { v: String(v), exp: o.expirationTtl ? Date.now() + o.expirationTtl * 1000 : 0 });
  }
  async delete(k) { this.#check(); this.map.delete(k); }
  async list({ prefix = '' } = {}) { this.#check(); return { keys: [...this.map.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; }
}

/** Fresh environment: KV, encryption key, Stripe test config. */
export function freshEnv({ kv = new MemoryKV(), key = TEST_KEY } = {}) {
  globalThis.__novaTestEnv = { NOVA_KV: kv };
  process.env.NOVA_ENCRYPTION_KEY = key ?? '';
  if (!key) delete process.env.NOVA_ENCRYPTION_KEY;
  delete process.env.NOVA_ENCRYPTION_KEY_PREVIOUS;
  process.env.STRIPE_SECRET_KEY = 'sk_test_integration';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_integration_secret';
  return kv;
}

export function noKV() { globalThis.__novaTestEnv = {}; }

let seq = 0;
/** Create a user + session directly in KV. */
export async function seedUser(kv, { email = `user${++seq}@example.com`, expired = false, subscribedUntil = 0 } = {}) {
  const now = Date.now();
  const userId = 'uid-' + Math.random().toString(36).slice(2, 10);
  const trialStartedAt = expired ? now - 30 * 864e5 : now - 864e5;
  await kv.put(`user:${email}`, JSON.stringify({ userId, email, createdAt: trialStartedAt, trialStartedAt, subscribedUntil }));
  const sid = 'sid-' + Math.random().toString(36).slice(2, 14);
  await kv.put(`session:${sid}`, JSON.stringify({ userId, email, createdAt: now }));
  return { userId, email, sid, cookie: `ns_session=${sid}` };
}

const BASE = 'https://nova.test';

/** Build a NextRequest-compatible request. */
export async function request(path, { method = 'GET', cookie, headers = {}, body } = {}) {
  const { NextRequest } = await import('next/server.js');
  const h = new Headers({ host: 'nova.test', ...headers });
  if (cookie) h.set('cookie', cookie);
  return new NextRequest(BASE + path, { method, headers: h, body });
}

/**
 * Replace global fetch for the duration of a test.
 * `routes` maps a predicate or URL prefix to a handler returning a Response.
 * DNS-over-HTTPS answers default to a public address.
 */
export function mockFetch(routes = []) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const req = { url, method: init.method || input.method || 'GET', headers: new Headers(init.headers || input.headers), body: init.body };
    calls.push(req);
    if (url.startsWith('https://cloudflare-dns.com/dns-query')) {
      const name = new URL(url).searchParams.get('name');
      const type = new URL(url).searchParams.get('type');
      const priv = /^(rebind|internal)\./.test(name);
      const answer = type === 'A' ? [{ type: 1, data: priv ? '10.0.0.8' : '93.184.216.34' }] : [];
      return Response.json({ Answer: answer });
    }
    for (const [match, handler] of routes) {
      const hit = typeof match === 'function' ? match(url, req) : url.startsWith(match);
      if (hit) return handler(url, req);
    }
    return new Response('no mock for ' + url, { status: 599 });
  };
  return { calls, restore() { globalThis.fetch = original; } };
}

export { webcrypto };
