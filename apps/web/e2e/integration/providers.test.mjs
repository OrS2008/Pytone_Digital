// Provider clients (Xtream, Stalker) and the /api/providers routes.

import { test, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshEnv, seedUser, request, mockFetch } from './helpers.mjs';
import { XT, ST, xtreamRoutes, stalkerRoutes } from './provider-mocks.mjs';

const lib = () => import('../../src/lib/providers/index.ts');
const xt = () => import('../../src/lib/providers/xtream.ts');
const st = () => import('../../src/lib/providers/stalker.ts');
const routes = {
  root: () => import('../../src/app/api/providers/route.ts'),
  one: () => import('../../src/app/api/providers/[id]/route.ts'),
  live: () => import('../../src/app/api/providers/[id]/live/route.ts'),
  vod: () => import('../../src/app/api/providers/[id]/vod/route.ts'),
  vodOne: () => import('../../src/app/api/providers/[id]/vod/[vid]/route.ts'),
  series: () => import('../../src/app/api/providers/[id]/series/route.ts'),
  seriesOne: () => import('../../src/app/api/providers/[id]/series/[sid]/route.ts'),
  play: () => import('../../src/app/api/providers/[id]/play/[...ref]/route.ts'),
  epg: () => import('../../src/app/api/providers/[id]/epg/route.ts'),
  stream: () => import('../../src/app/api/stream/route.ts'),
};
const viewer = () => import('../../src/lib/viewerAuth.ts');

let net;
beforeEach(async () => (await viewer()).clearViewerCache());
afterEach(() => net?.restore());

const ctx = (params) => ({ params: Promise.resolve(params) });

// ─────────────────────────────── Xtream client ───────────────────────────────

test('xtream config: canonicalises pasted links, rejects bad input', async () => {
  const { normaliseXtreamConfig } = await xt();
  assert.deepEqual(normaliseXtreamConfig({ server: 'xtream.example.com:8080/get.php', username: ' a ', password: 'b' }),
    { server: 'http://xtream.example.com:8080', username: 'a', password: 'b' });
  for (const bad of [{ server: '', username: 'a', password: 'b' }, { server: 'ftp://x', username: 'a', password: 'b' },
    { server: 'http://u:p@x.com', username: 'a', password: 'b' }, { server: 'http://x.com', username: 'a'.repeat(200), password: 'b' }]) {
    assert.throws(() => normaliseXtreamConfig(bad), { code: 'invalid_config' }, JSON.stringify(bad));
  }
});

test('xtream client: login, account, capabilities, categories, normalised content', async () => {
  const log = [];
  net = mockFetch(xtreamRoutes({ log }));
  const { makeClient } = await lib();
  const c = makeClient('xtream', { server: XT.server, username: XT.user, password: XT.pass });
  const acct = await c.login();
  assert.equal(acct.status, 'Active');
  assert.equal(acct.expiresAt, 1893456000 * 1000);
  assert.equal(acct.maxConnections, 2);
  assert.deepEqual(await c.capabilities(), { live: true, vod: true, series: true, epg: true, catchup: true });

  const live = await c.liveChannels();
  assert.equal(live.length, 2, 'rows without stream_id are dropped');
  assert.deepEqual(live[0], { id: '101', number: 1, name: 'World News HD', logo: 'http://img.example.com/wn.png', categoryId: '1', epgId: 'wn.uk', catchupDays: 3 });
  assert.equal(live[1].logo, '', 'non-http logo URLs are discarded');

  const movies = await c.movies();
  assert.equal(movies[0].ext, 'mkv');
  assert.equal(movies[0].rating, 8.4);
  assert.equal(movies[0].year, 2021);
  const md = await c.movieDetail('501');
  assert.equal(md.durationMin, 90);
  assert.equal(md.backdrop, 'http://img.example.com/bd.jpg');

  const sd = await c.seriesDetail('900');
  assert.deepEqual(sd.seasons.map((s) => [s.number, s.name, s.episodes.map((e) => e.number)]), [[1, 'Season One', [1, 2]], [2, 'Season Two', [1]]]);
  assert.equal(sd.seasons[0].episodes[0].plot, 'Pilot');
  assert.ok(log.some((l) => l.includes('action=get_series_info') && l.includes('series_id=900')));
});

test('xtream client: rejected credentials and inactive accounts are distinct errors', async () => {
  const { makeClient } = await lib();
  net = mockFetch(xtreamRoutes());
  await assert.rejects(makeClient('xtream', { server: XT.server, username: XT.user, password: 'wrong' }).login(), { code: 'auth_failed' });
  net.restore();
  net = mockFetch(xtreamRoutes({ status: 'Expired' }));
  await assert.rejects(makeClient('xtream', { server: XT.server, username: XT.user, password: XT.pass }).login(), { code: 'account_inactive' });
});

test('xtream client: playback URLs, HLS preference, timeshift in the server timezone', async () => {
  const { makeClient } = await lib();
  const { formatInZone } = await xt();
  net = mockFetch(xtreamRoutes({ timezone: 'Asia/Jerusalem' }));
  const c = makeClient('xtream', { server: XT.server, username: XT.user, password: XT.pass });
  assert.equal((await c.resolve({ kind: 'live', id: '101' })).url, `${XT.server}/live/alice/s3cret/101.m3u8`);
  assert.equal((await c.resolve({ kind: 'movie', id: '501', ext: 'mkv' })).url, `${XT.server}/movie/alice/s3cret/501.mkv`);
  assert.equal((await c.resolve({ kind: 'episode', id: '9011', ext: 'mp4' })).url, `${XT.server}/series/alice/s3cret/9011.mp4`);
  const start = Date.UTC(2026, 10, 15, 18, 30) / 1000;             // 18:30 UTC = 20:30 in Jerusalem (winter)
  assert.equal((await c.resolve({ kind: 'catchup', id: '101', startSec: start, durationMin: 60 })).url,
    `${XT.server}/timeshift/alice/s3cret/60/2026-11-15:20-30/101.m3u8`);
  assert.equal(formatInZone(start * 1000, 'Not/AZone'), '2026-11-15:18-30', 'unknown zone falls back to UTC');
  await assert.rejects(c.resolve({ kind: 'live', id: '../../etc' }), { code: 'invalid_config' });

  net.restore();
  net = mockFetch(xtreamRoutes({ formats: ['ts'] }));
  const tsOnly = makeClient('xtream', { server: XT.server, username: XT.user, password: XT.pass });
  assert.ok((await tsOnly.resolve({ kind: 'live', id: '101' })).url.endsWith('.ts'));
});

// ─────────────────────────────── Stalker client ───────────────────────────────

test('stalker config: MAC and portal validation', async () => {
  const { normaliseStalkerConfig } = await st();
  assert.deepEqual(normaliseStalkerConfig({ portal: 'stalker.example.com/stalker_portal/c/', mac: '00-1a-79-ab-cd-ef' }),
    { portal: 'http://stalker.example.com/stalker_portal', mac: '00:1A:79:AB:CD:EF' });
  assert.throws(() => normaliseStalkerConfig({ portal: 'http://x', mac: 'nope' }), { code: 'invalid_config' });
  assert.throws(() => normaliseStalkerConfig({ portal: 'file:///etc', mac: '00:1A:79:AB:CD:EF' }), { code: 'invalid_config' });
});

test('stalker client: handshake → bearer token → profile → channels → create_link', async () => {
  const log = [];
  net = mockFetch(stalkerRoutes({ log }));
  const { makeClient } = await lib();
  const c = makeClient('stalker', { portal: `${ST.portal}/stalker_portal`, mac: ST.mac });
  const acct = await c.login();
  assert.equal(acct.expiresAt, Date.parse('2030-01-01T00:00:00'));
  assert.equal(log[0].action, 'stb.handshake');
  assert.equal(log[0].auth, null, 'no token before the handshake');
  assert.match(log[1].auth, /^Bearer TOKEN\d+$/);
  assert.ok(log.every((l) => l.cookie.includes('mac=00%3A1A%3A79%3AAB%3ACD%3AEF') && /MAG200/.test(l.ua)));

  const ch = await c.liveChannels();
  assert.deepEqual(ch.map((x) => [x.id, x.name, x.number]), [['3001', 'Portal One', 1], ['3002', 'Portal Two', 2]]);
  assert.deepEqual((await c.liveCategories()).map((g) => g.id), ['5'], 'the "*" pseudo-genre is skipped');
  const live = await c.resolve({ kind: 'live', id: '3001' });
  assert.equal(live.url, 'http://cdn.stalker.example.com/live/3001.m3u8?play_token=abc123', '"ffmpeg " prefix stripped');

  assert.deepEqual((await c.movies()).map((m) => m.name), ['Portal Film']);
  assert.deepEqual((await c.series()).map((s) => s.name), ['Portal Show']);
  const sd = await c.seriesDetail('700');
  assert.deepEqual(sd.seasons.map((s) => [s.number, s.episodes.length]), [[1, 3], [2, 1]]);
  const ep = await c.resolve({ kind: 'episode', id: sd.seasons[0].episodes[1].id, ext: 'stalker' });
  assert.equal(ep.url, 'http://cdn.stalker.example.com/vod/ep2.mp4?t=xyz');
  assert.deepEqual(await c.capabilities(), { live: true, vod: true, series: true, epg: false, catchup: false });
  await assert.rejects(c.resolve({ kind: 'catchup', id: '3001', startSec: 1, durationMin: 1 }), { code: 'unsupported' });
});

test('stalker client: expired token is refreshed transparently; unknown MAC is rejected', async () => {
  const log = [];
  net = mockFetch(stalkerRoutes({ expireAfter: 2, log }));   // token dies on the 3rd authorised call
  const { makeClient } = await lib();
  const c = makeClient('stalker', { portal: `${ST.portal}/stalker_portal`, mac: ST.mac });
  await c.login();
  const ch = await c.liveChannels();          // the portal starts rejecting the token mid-way
  assert.equal(ch.length, 2);
  assert.ok(log.filter((l) => l.action === 'stb.handshake').length >= 2, 're-handshaked');

  net.restore();
  net = mockFetch(stalkerRoutes({ knownMac: '00:1A:79:00:00:00' }));
  const other = makeClient('stalker', { portal: `${ST.portal}/stalker_portal`, mac: '00:1A:79:11:11:11' });
  await assert.rejects(other.login(), { code: 'auth_failed' });
});

// ─────────────────────────────── API routes ───────────────────────────────

async function addXtream(cookie, password = XT.pass) {
  const res = await (await routes.root()).POST(await request('/api/providers', { method: 'POST', cookie,
    body: JSON.stringify({ type: 'xtream', name: 'My Xtream', config: { server: XT.server, username: XT.user, password } }) }));
  return { res, body: await res.json() };
}

test('POST /api/providers: verified, stored encrypted, never echoes secrets', async () => {
  const kv = freshEnv();
  const u = await seedUser(kv);
  net = mockFetch(xtreamRoutes());
  const { res, body } = await addXtream(u.cookie);
  assert.equal(res.status, 201);
  const text = JSON.stringify(body);
  assert.ok(!text.includes('s3cret') && !text.includes('"alice"'), 'response must not contain credentials');
  assert.match(body.provider.label, /^xtream\.example\.com:8080 · a•+e$/);
  assert.deepEqual(body.provider.capabilities, { live: true, vod: true, series: true, epg: true, catchup: true });
  const raw = kv.map.get(`providers:${u.userId}`).v;
  assert.ok(raw.startsWith('nsb1.') && !raw.includes('s3cret') && !raw.includes('xtream.example.com'), 'KV holds ciphertext only');

  const list = await (await routes.root()).GET(await request('/api/providers', { cookie: u.cookie }));
  const listed = await list.json();
  assert.equal(listed.providers.length, 1);
  assert.ok(!JSON.stringify(listed).includes('s3cret'));
});

test('POST /api/providers: bad credentials → 422 and nothing saved; no key → 503; anonymous → 401', async () => {
  let kv = freshEnv();
  const u = await seedUser(kv);
  net = mockFetch(xtreamRoutes());
  const bad = await addXtream(u.cookie, 'wrong');
  assert.equal(bad.res.status, 422);
  assert.equal(bad.body.error, 'auth_failed');
  assert.ok(!kv.map.has(`providers:${u.userId}`));

  kv = freshEnv({ key: null });
  const v = await seedUser(kv);
  (await viewer()).clearViewerCache();
  assert.equal((await addXtream(v.cookie)).res.status, 503, 'refuses to store credentials without encryption');
  assert.equal((await addXtream(undefined)).res.status, 401);

  freshEnv();
  const w = await seedUser(globalThis.__novaTestEnv.NOVA_KV);
  const malformed = await (await routes.root()).POST(await request('/api/providers', { method: 'POST', cookie: w.cookie, body: '{"type":"other"}' }));
  assert.equal(malformed.status, 400);
  const huge = await (await routes.root()).POST(await request('/api/providers', { method: 'POST', cookie: w.cookie, body: 'x'.repeat(10_000) }));
  assert.equal(huge.status, 413);
});

test('provider content routes: live / vod / series in the shared model, play redirects to a sealed stream', async () => {
  const kv = freshEnv();
  const u = await seedUser(kv);
  net = mockFetch(xtreamRoutes());
  const { body } = await addXtream(u.cookie);
  const id = body.provider.id;

  const live = await (await (await routes.live()).GET(await request(`/api/providers/${id}/live`, { cookie: u.cookie }), ctx({ id }))).json();
  assert.equal(live.channels.length, 2);
  const ch = live.channels[0];
  assert.equal(ch.streamUrl, `/api/providers/${id}/play/live/101.m3u8`);
  assert.equal(ch.category, 'News');
  assert.equal(ch.catchupKind, 'vod');
  assert.equal(ch.catchupSource, `/api/providers/${id}/play/catchup/101/\${utc}/\${duration}.m3u8`);
  assert.ok(!JSON.stringify(live).includes('s3cret'));

  const vod = await (await (await routes.vod()).GET(await request(`/api/providers/${id}/vod`, { cookie: u.cookie }), ctx({ id }))).json();
  assert.equal(vod.movies[0].name, 'The Movie (2021)');
  const movie = await (await (await routes.vodOne()).GET(await request(`/api/providers/${id}/vod/501`, { cookie: u.cookie }), ctx({ id, vid: '501' }))).json();
  assert.equal(movie.movie.plot, 'A plot.');
  const series = await (await (await routes.seriesOne()).GET(await request(`/api/providers/${id}/series/900`, { cookie: u.cookie }), ctx({ id, sid: '900' }))).json();
  assert.equal(series.seasons.length, 2);

  // play → 302 → /api/stream?t=… → the real Xtream URL is fetched, manifest re-sealed
  const play = await (await routes.play()).GET(await request(`/api/providers/${id}/play/live/101.m3u8`, { cookie: u.cookie }), ctx({ id, ref: ['live', '101.m3u8'] }));
  assert.equal(play.status, 302);
  const loc = play.headers.get('location');
  assert.match(loc, /^\/api\/stream\?t=nsb1\./);
  assert.ok(!loc.includes('s3cret'));
  const streamed = await (await routes.stream()).GET(await request(loc, { cookie: u.cookie }));
  assert.equal(streamed.status, 200);
  const manifest = await streamed.text();
  assert.ok(!manifest.includes('s3cret') && manifest.includes('/api/stream?t='), 'segment URL with credentials was sealed');
  assert.ok(net.calls.some((c) => c.url === `${XT.server}/live/alice/s3cret/101.m3u8`));

  const cu = await (await routes.play()).GET(await request('/x', { cookie: u.cookie }), ctx({ id, ref: ['catchup', '101', String(Math.floor(Date.now() / 1000) - 7200), '60.m3u8'] }));
  assert.equal(cu.status, 302);
  for (const bad of [['live', '..%2F..%2Fetc.m3u8'], ['catchup', '101', '0', '60.m3u8'], ['catchup', '101', String(Math.floor(Date.now() / 1000)), '100000.m3u8'], ['nope', '1']]) {
    assert.equal((await (await routes.play()).GET(await request('/x', { cookie: u.cookie }), ctx({ id, ref: bad }))).status, 400, bad.join('/'));
  }

  const epg = await (await routes.epg()).GET(await request(`/api/providers/${id}/epg`, { cookie: u.cookie }), ctx({ id }));
  assert.equal(epg.status, 200);
  assert.ok((await epg.text()).includes('wn.uk'));
});

test('IDOR: another account cannot see, use, play or delete my provider', async () => {
  const kv = freshEnv();
  const me = await seedUser(kv);
  const them = await seedUser(kv);
  net = mockFetch(xtreamRoutes());
  const { body } = await addXtream(me.cookie);
  const id = body.provider.id;
  const as = (cookie) => ({ cookie });
  assert.equal((await (await routes.live()).GET(await request(`/api/providers/${id}/live`, as(them.cookie)), ctx({ id }))).status, 404);
  assert.equal((await (await routes.play()).GET(await request('/x', as(them.cookie)), ctx({ id, ref: ['live', '101.m3u8'] }))).status, 404);
  assert.equal((await (await routes.one()).DELETE(await request('/x', { method: 'DELETE', cookie: them.cookie }), ctx({ id }))).status, 404);
  assert.equal((await (await (await routes.root()).GET(await request('/api/providers', as(them.cookie)))).json()).providers.length, 0);

  // and a play token issued to me is useless to them
  const play = await (await routes.play()).GET(await request('/x', as(me.cookie)), ctx({ id, ref: ['live', '101.m3u8'] }));
  assert.equal((await (await routes.stream()).GET(await request(play.headers.get('location'), as(them.cookie)))).status, 403);

  // owner can delete; secrets are gone
  assert.equal((await (await routes.one()).DELETE(await request('/x', { method: 'DELETE', cookie: me.cookie }), ctx({ id }))).status, 200);
  assert.ok(!kv.map.has(`providers:${me.userId}`));
});

test('stalker through the API: add, live list, play resolves create_link server-side', async () => {
  const kv = freshEnv();
  const u = await seedUser(kv);
  net = mockFetch(stalkerRoutes());
  const add = await (await routes.root()).POST(await request('/api/providers', { method: 'POST', cookie: u.cookie,
    body: JSON.stringify({ type: 'stalker', name: 'Portal', config: { portal: `${ST.portal}/stalker_portal/c/`, mac: ST.mac } }) }));
  assert.equal(add.status, 201);
  const { provider } = await add.json();
  assert.match(provider.label, /00:1A:79:••:••:••/);
  const live = await (await (await routes.live()).GET(await request('/x', { cookie: u.cookie }), ctx({ id: provider.id }))).json();
  assert.equal(live.channels.length, 2);
  const play = await (await routes.play()).GET(await request('/x', { cookie: u.cookie }), ctx({ id: provider.id, ref: ['live', '3001.m3u8'] }));
  assert.equal(play.status, 302);
  assert.ok(!play.headers.get('location').includes('play_token'), 'the portal token stays sealed');
});
