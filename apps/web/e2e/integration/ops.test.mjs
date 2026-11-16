// Operations: health checks, request ids, structured log redaction, admin diag gate.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshEnv, noKV, request, MemoryKV } from './helpers.mjs';

const health = () => import('../../src/app/api/health/route.ts');
const diag = () => import('../../src/app/api/admin/diag/route.ts');
const mw = () => import('../../src/middleware.ts');
const logLib = () => import('../../src/lib/log.ts');

test('GET /api/health: ok with a working KV, 503 when storage is down, no config details', async () => {
  freshEnv();
  let res = await (await health()).GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.deepEqual(Object.keys(body).sort(), ['build', 'status', 'storage', 'time']);
  noKV();
  res = await (await health()).GET();
  assert.equal(res.status, 503);
  const kv = freshEnv();
  kv.failing = true;
  assert.equal((await (await health()).GET()).status, 503);
});

test('GET /api/admin/diag requires an admin session', async () => {
  freshEnv();
  process.env.ADMIN_SESSION_SECRET = 'x'.repeat(40);
  const res = await (await diag()).GET(await request('/api/admin/diag'));
  assert.ok(res.status === 401 || res.status === 403, `got ${res.status}`);
});

test('middleware stamps an x-request-id on API requests and responses', async () => {
  const { middleware } = await mw();
  const res = await middleware(await request('/api/health'));
  const rid = res.headers.get('x-request-id');
  assert.match(rid, /^[0-9a-f-]{36}$/);
  assert.equal(res.headers.get('x-middleware-request-x-request-id'), rid, 'forwarded to the route handler');
  const fromRay = await middleware(await request('/api/health', { headers: { 'cf-ray': '8abc123-TLV' } }));
  assert.equal(fromRay.headers.get('x-request-id'), '8abc123-TLV');
});

test('structured log: one JSON line, credentials and query strings redacted', async () => {
  const { log, redactUrl } = await logLib();
  assert.equal(redactUrl('http://p.tv:8080/live/alice/s3cret/101.m3u8?token=abc'), 'http://p.tv:8080/live/***/***/101.m3u8?…');
  const lines = [];
  const orig = console.warn;
  console.warn = (s) => lines.push(s);
  try {
    log('warn', 'test.event', { password: 'hunter2', mac: '00:1A:79:00:00:01', url: 'http://p.tv/get.php?username=a&password=b', nested: { token: 't' }, count: 3 },
      await request('/x', { headers: { 'x-request-id': 'rid-1' } }));
  } finally { console.warn = orig; }
  assert.equal(lines.length, 1);
  const o = JSON.parse(lines[0]);
  assert.equal(o.event, 'test.event');
  assert.equal(o.rid, 'rid-1');
  assert.equal(o.password, '***');
  assert.equal(o.mac, '***');
  assert.equal(o.nested.token, '***');
  assert.equal(o.url, 'http://p.tv/get.php?…');
  assert.equal(o.count, 3);
  assert.ok(!lines[0].includes('hunter2') && !lines[0].includes('username=a'));
});
