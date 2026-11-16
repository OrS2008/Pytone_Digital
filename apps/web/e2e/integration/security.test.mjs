// Security regression tests that run the REAL route handlers.
// Run: node --import ./integration/register.mjs --test integration/

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshEnv, noKV, seedUser, request, mockFetch, MemoryKV, OTHER_KEY, TEST_KEY } from './helpers.mjs';

const stream  = () => import('../../src/app/api/stream/route.ts');
const m3u     = () => import('../../src/app/api/m3u/route.ts');
const epg     = () => import('../../src/app/api/epg/route.ts');
const probe   = () => import('../../src/app/api/stream/probe/route.ts');
const digest  = () => import('../../src/app/api/playlist/digest/route.ts');
const settings = () => import('../../src/app/api/settings/route.ts');
const viewer  = () => import('../../src/lib/viewerAuth.ts');
const token   = () => import('../../src/lib/streamToken.ts');
const box     = () => import('../../src/lib/secretBox.ts');
const rl      = () => import('../../src/lib/rateLimit.ts');

let net;
beforeEach(async () => { (await viewer()).clearViewerCache(); });
afterEach(() => net?.restore());

const MANIFEST = '#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\nseg1.ts\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:2,\nhttp://cdn.provider.tv/live/alice/s3cret/seg2.ts\n';
const upstream = (u) => u.startsWith('http://provider.tv/') || u.startsWith('http://cdn.provider.tv/');
const serve = (u) => u.endsWith('.m3u8')
  ? new Response(MANIFEST, { headers: { 'content-type': 'application/vnd.apple.mpegurl' } })
  : u.endsWith('.m3u') ? new Response('#EXTM3U\n#EXTINF:-1,A\nhttp://provider.tv/a.m3u8\n', { headers: { 'content-type': 'audio/x-mpegurl' } })
  : new Response(new Uint8Array(188), { headers: { 'content-type': 'video/mp2t' } });

// ─────────────────────────── proxy access control ───────────────────────────

const PROXY_CALLS = [
  ['GET /api/stream',          async (o) => (await stream()).GET(await request('/api/stream?url=' + encodeURIComponent('http://provider.tv/x.m3u8'), o))],
  ['GET /api/m3u',             async (o) => (await m3u()).GET(await request('/api/m3u?url=' + encodeURIComponent('http://provider.tv/p.m3u'), o))],
  ['GET /api/epg',             async (o) => (await epg()).GET(await request('/api/epg?url=' + encodeURIComponent('http://provider.tv/g.xml'), o))],
  ['POST /api/stream/probe',   async (o) => (await probe()).POST(await request('/api/stream/probe', { ...o, method: 'POST', headers: { 'content-type': 'application/json', ...(o.headers || {}) }, body: JSON.stringify({ url: 'http://provider.tv/x.m3u8' }) }))],
  ['POST /api/playlist/digest', async (o) => (await digest()).POST(await request('/api/playlist/digest', { ...o, method: 'POST', headers: { 'content-type': 'application/json', ...(o.headers || {}) }, body: JSON.stringify({ m3u: 'http://provider.tv/p.m3u' }) }))],
];

for (const [name, call] of PROXY_CALLS) {
  test(`${name}: refuses anonymous callers even with a forged same-host Referer/Origin`, async () => {
    freshEnv();
    net = mockFetch([[upstream, serve]]);
    const res = await call({ headers: { referer: 'https://nova.test/tv/live', origin: 'https://nova.test' } });
    assert.equal(res.status, 401);
    assert.equal(net.calls.filter((c) => upstream(c.url)).length, 0, 'must not contact the provider');
  });

  test(`${name}: refuses an expired trial (402) and an invalid session (401)`, async () => {
    const kv = freshEnv();
    net = mockFetch([[upstream, serve]]);
    const expired = await seedUser(kv, { expired: true });
    assert.equal((await call({ cookie: expired.cookie })).status, 402);
    assert.equal((await call({ cookie: 'ns_session=forged-session-id' })).status, 401);
  });

  test(`${name}: fails closed (503) when KV is missing or erroring`, async () => {
    noKV();
    net = mockFetch([[upstream, serve]]);
    assert.equal((await call({ cookie: 'ns_session=x' })).status, 503);
    const kv = freshEnv();
    const u = await seedUser(kv);
    (await viewer()).clearViewerCache();
    kv.failing = true;
    assert.equal((await call({ cookie: u.cookie })).status, 503);
  });
}

test('GET /api/stream: a signed-in trial user is proxied; manifest URLs are rewritten through the proxy', async () => {
  const kv = freshEnv();
  net = mockFetch([[upstream, serve]]);
  const u = await seedUser(kv);
  const res = await (await stream()).GET(await request('/api/stream?url=' + encodeURIComponent('http://provider.tv/x.m3u8'), { cookie: u.cookie }));
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.ok(body.includes('/api/stream?url=' + encodeURIComponent('http://provider.tv/seg1.ts')));
  assert.ok(body.includes('URI="/api/stream?url='), 'key URI must be proxied too');
});

test('GET /api/m3u: per-account rate limit returns 429', async () => {
  const kv = freshEnv();
  net = mockFetch([[upstream, serve]]);
  const u = await seedUser(kv);
  let last;
  for (let i = 0; i < 31; i++) last = await (await m3u()).GET(await request('/api/m3u?url=' + encodeURIComponent('http://provider.tv/p.m3u'), { cookie: u.cookie }));
  assert.equal(last.status, 429);
  assert.ok(last.headers.get('retry-after'));
});

test('CORS: a foreign Origin is not reflected; our own is', async () => {
  const kv = freshEnv();
  net = mockFetch([[upstream, serve]]);
  const u = await seedUser(kv);
  const call = async (origin) => (await stream()).GET(await request('/api/stream?url=' + encodeURIComponent('http://provider.tv/x.m3u8'), { cookie: u.cookie, headers: { origin } }));
  assert.equal((await call('https://evil.example')).headers.get('access-control-allow-origin'), null);
  assert.equal((await call('https://nova.test')).headers.get('access-control-allow-origin'), 'https://nova.test');
});

// ─────────────────────────────── stream tokens ───────────────────────────────

test('stream token: hides credentials end to end and is bound to its user', async () => {
  const kv = freshEnv();
  net = mockFetch([[upstream, serve]]);
  const alice = await seedUser(kv);
  const bob = await seedUser(kv);
  const { sealStreamTarget } = await token();
  const t = await sealStreamTarget({ url: 'http://provider.tv/live/alice/s3cret/1.m3u8' }, alice.userId);
  assert.ok(!t.includes('s3cret') && !t.includes('alice'));

  const res = await (await stream()).GET(await request('/api/stream?t=' + encodeURIComponent(t), { cookie: alice.cookie }));
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.ok(!body.includes('s3cret') && !body.includes('alice'), 'segment URLs must be sealed, not readable');
  assert.ok(body.includes('/api/stream?t='));
  assert.ok(net.calls.some((c) => c.url === 'http://provider.tv/live/alice/s3cret/1.m3u8'), 'proxy fetched the real URL');

  // a sealed segment URL from the manifest works for its owner
  const seg = body.split('\n').find((l) => l.startsWith('/api/stream?t='));
  assert.equal((await (await stream()).GET(await request(seg, { cookie: alice.cookie }))).status, 200);

  // …but not for another account, and not when tampered with
  assert.equal((await (await stream()).GET(await request('/api/stream?t=' + encodeURIComponent(t), { cookie: bob.cookie }))).status, 403);
  const tampered = t.slice(0, -4) + (t.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  assert.equal((await (await stream()).GET(await request('/api/stream?t=' + encodeURIComponent(tampered), { cookie: alice.cookie }))).status, 403);
});

test('stream token: expires', async () => {
  freshEnv();
  const { sealStreamTarget, openStreamTarget } = await token();
  const t = await sealStreamTarget({ url: 'http://provider.tv/a.m3u8' }, 'u1', -1);
  assert.deepEqual(await openStreamTarget(t, 'u1'), { ok: false, reason: 'expired' });
});

// ────────────────────────────────── SSRF ──────────────────────────────────

test('SSRF: private targets refused before any request, incl. DNS rebinding and redirects', async () => {
  const kv = freshEnv();
  const u = await seedUser(kv);
  net = mockFetch([
    ['http://redirector.example/', () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } })],
    ['http://rebind.example.com/', () => new Response('should never be fetched')],
  ]);
  const get = async (url) => (await stream()).GET(await request('/api/stream?url=' + encodeURIComponent(url), { cookie: u.cookie }));
  for (const url of ['http://127.0.0.1/x', 'http://[::ffff:7f00:1]/x', 'http://0x7f.1/x', 'http://metadata.google.internal/x']) {
    assert.equal((await get(url)).status, 400, url);
  }
  assert.equal((await get('http://rebind.example.com/x.m3u8')).status, 400, 'hostname resolving to 10.x must be refused');
  assert.equal((await get('http://redirector.example/x.m3u8')).status, 400, 'redirect into metadata must be refused');
  assert.ok(!net.calls.some((c) => c.url.includes('169.254') || c.url.startsWith('http://rebind.')));
});

test('SSRF: when the DNS check cannot run, the request is refused (fail closed)', async () => {
  const kv = freshEnv();
  const u = await seedUser(kv);
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); if (String(url).includes('dns-query')) throw new Error('DoH down'); return new Response('x'); };
  try {
    const res = await (await stream()).GET(await request('/api/stream?url=' + encodeURIComponent('http://dns-down-host.example/x.m3u8'), { cookie: u.cookie }));
    assert.equal(res.status, 400);
    assert.ok(!calls.some((c) => c.startsWith('http://dns-down-host')));
  } finally { globalThis.fetch = original; }
});

test('SSRF: oversized manifests are refused', async () => {
  const kv = freshEnv();
  const u = await seedUser(kv);
  net = mockFetch([[upstream, () => new Response('#EXTM3U\n' + 'x'.repeat(5 * 1024 * 1024), { headers: { 'content-type': 'application/vnd.apple.mpegurl' } })]]);
  const res = await (await stream()).GET(await request('/api/stream?url=' + encodeURIComponent('http://provider.tv/big.m3u8'), { cookie: u.cookie }));
  assert.equal(res.status, 502);
});

// ─────────────────────────────── secrets at rest ───────────────────────────────

test('secretBox: round trip, aad binding, tamper detection, key rotation', async () => {
  freshEnv();
  const { seal, open } = await box();
  const t = await seal('http://p.tv/get.php?username=a&password=b', 'user-1');
  assert.ok(!t.includes('password'));
  assert.equal(await open(t, 'user-1'), 'http://p.tv/get.php?username=a&password=b');
  assert.equal(await open(t, 'user-2'), null, 'bound to its owner');
  assert.equal(await open(t.slice(0, -2) + 'xx', 'user-1'), null, 'tampering detected');

  process.env.NOVA_ENCRYPTION_KEY = OTHER_KEY;          // rotate
  process.env.NOVA_ENCRYPTION_KEY_PREVIOUS = TEST_KEY;
  assert.equal(await open(t, 'user-1'), 'http://p.tv/get.php?username=a&password=b', 'old ciphertext still opens');
  delete process.env.NOVA_ENCRYPTION_KEY_PREVIOUS;
  assert.equal(await open(t, 'user-1'), null, 'retired key no longer opens');
});

test('settings: stored encrypted, readable by owner, never readable as plaintext in KV', async () => {
  const kv = freshEnv();
  const u = await seedUser(kv);
  const blob = JSON.stringify({ 'sources.live': [{ sub: 'http://p.tv/get.php?username=alice&password=s3cret' }] });
  const put = await (await settings()).PUT(await request('/api/settings', { method: 'PUT', cookie: u.cookie, body: blob, headers: { 'content-type': 'application/json' } }));
  assert.equal(put.status, 200);
  assert.equal((await put.json()).encrypted, true);
  const raw = kv.map.get(`settings:${u.userId}`).v;
  assert.ok(raw.startsWith('nsb1.') && !raw.includes('s3cret'));

  const get = await (await settings()).GET(await request('/api/settings', { cookie: u.cookie }));
  assert.equal((await get.json()).settings['sources.live'][0].sub, 'http://p.tv/get.php?username=alice&password=s3cret');
});

test('settings: a blob copied into another account does not open; unreadable data is never reported as empty', async () => {
  const kv = freshEnv();
  const a = await seedUser(kv);
  const b = await seedUser(kv);
  await (await settings()).PUT(await request('/api/settings', { method: 'PUT', cookie: a.cookie, body: '{"x":1}' }));
  kv.map.set(`settings:${b.userId}`, kv.map.get(`settings:${a.userId}`));
  const res = await (await settings()).GET(await request('/api/settings', { cookie: b.cookie }));
  assert.equal(res.status, 503, 'must not return {} — the client would overwrite real data');
});

test('settings: legacy plaintext still reads; malformed and oversized writes are refused', async () => {
  const kv = freshEnv();
  const u = await seedUser(kv);
  await kv.put(`settings:${u.userId}`, '{"legacy":true}');
  assert.equal((await (await (await settings()).GET(await request('/api/settings', { cookie: u.cookie }))).json()).settings.legacy, true);
  const put = async (body) => (await (await settings()).PUT(await request('/api/settings', { method: 'PUT', cookie: u.cookie, body }))).status;
  assert.equal(await put('not json'), 400);
  assert.equal(await put('[1,2]'), 400);
  assert.equal(await put('"str"'), 400);
  assert.equal(await put(JSON.stringify({ big: 'x'.repeat(1024 * 1024) })), 413);
});

test('settings: without an encryption key the API says so instead of claiming encryption', async () => {
  const kv = freshEnv({ key: null });
  const u = await seedUser(kv);
  const res = await (await settings()).PUT(await request('/api/settings', { method: 'PUT', cookie: u.cookie, body: '{"a":1}' }));
  assert.equal((await res.json()).encrypted, false);
});

// ─────────────────────────────── rate limiter ───────────────────────────────

test('rate limiter fails closed when KV errors, and uses a valid TTL', async () => {
  const kv = new MemoryKV();
  const { rateLimit } = await rl();
  assert.equal((await rateLimit(kv, 'b', 'id', 5, 10)).ok, true, 'short windows must not produce an invalid (<60 s) TTL');
  kv.failing = true;
  assert.equal((await rateLimit(kv, 'b', 'id', 5, 10)).ok, false);
});
