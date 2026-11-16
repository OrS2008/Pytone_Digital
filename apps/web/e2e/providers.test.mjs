// Browser tests for the provider UI (Xtream connection, Movies, Series,
// Watch). /api/providers/* is mocked at the network edge with responses
// in the server's real output shape (verified separately by
// integration/providers.test.mjs), so this proves the CLIENT wiring.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BASE, PHONE, DESKTOP, newContext, open, waitPlaying, closeBrowser, spill } from './harness.mjs';

after(closeBrowser);

const PID = 'abcd1234efgh5678';
const CAPS = { live: true, vod: true, series: true, epg: true, catchup: true };
const FIXTURE = '/api/stream?url=' + encodeURIComponent('https://streams.test/ch1/index.m3u8');
const HLS_DIR = new URL('./fixtures/hls/', import.meta.url);
const fixtureManifest = () => readFileSync(new URL('index.m3u8', HLS_DIR), 'utf8')
  .replace(/^(seg\d+\.ts)$/gm, (m) => '/api/stream?url=' + encodeURIComponent('https://streams.test/' + m));

async function mockProviders(ctx, { added = [], failAdd = false } = {}) {
  const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const posts = [];
  await ctx.route((u) => u.pathname.startsWith('/api/providers'), async (r) => {
    const u = new URL(r.request().url());
    const p = u.pathname;
    if (p === '/api/providers' && r.request().method() === 'POST') {
      const body = JSON.parse(r.request().postData() || '{}');
      posts.push(body);
      if (failAdd) return r.fulfill(json({ error: 'auth_failed', message: 'The provider rejected these credentials.' }, 422));
      const provider = { id: PID, type: body.type, name: body.name || 'Xtream Codes', createdAt: Date.now(), capabilities: CAPS,
        account: { status: 'Active', expiresAt: Date.UTC(2030, 0, 1), maxConnections: 2, activeConnections: 0 }, checkedAt: Date.now(), label: 'xtream.example.com · a•••e' };
      added.push(provider);
      return r.fulfill(json({ provider }, 201));
    }
    if (p === '/api/providers') return r.fulfill(json({ providers: added, encryption: true }));
    if (p === `/api/providers/${PID}/live`) return r.fulfill(json({ categories: [{ id: '1', name: 'News' }], channels: [
      { id: `p.${PID}.101`, number: 1, name: 'Provider News HD', logoUrl: '', category: 'News', streamUrl: `/api/providers/${PID}/play/live/101.m3u8` },
      { id: `p.${PID}.102`, number: 2, name: 'Provider Sport', logoUrl: '', category: 'Sport', streamUrl: `/api/providers/${PID}/play/live/102.m3u8` },
    ] }));
    if (p.startsWith(`/api/providers/${PID}/play/`)) {
      if (u.searchParams.get('json') === '1') return r.fulfill(json({ url: FIXTURE, hls: true }));
      // The real route answers 302 → /api/stream?t=… (covered by
      // integration/providers.test.mjs). Playwright does not re-route a
      // request that follows a fulfilled redirect, so serve the end result
      // — the fixture manifest — directly here.
      return r.fulfill({ status: 200, contentType: 'application/vnd.apple.mpegurl', body: fixtureManifest() });
    }
    if (p === `/api/providers/${PID}/vod`) return r.fulfill(json({ categories: [{ id: '10', name: 'Action' }, { id: '11', name: 'Drama' }], movies: [
      { id: '501', name: 'The Movie', poster: '', categoryId: '10', rating: 8.4, year: 2021, added: 1700000000000, ext: 'm3u8' },
      { id: '502', name: 'Another Film', poster: '', categoryId: '11', rating: 6.1, year: 2019, added: 1600000000000, ext: 'mp4' },
    ] }));
    if (p === `/api/providers/${PID}/vod/501`) return r.fulfill(json({ movie: { id: '501', name: 'The Movie', poster: '', categoryId: '10', rating: 8.4, year: 2021, added: null, ext: 'm3u8', plot: 'A gripping plot.', genre: 'Action', durationMin: 90, cast: 'A, B', director: 'C', backdrop: '' } }));
    if (p === `/api/providers/${PID}/series`) return r.fulfill(json({ categories: [{ id: '20', name: 'Drama' }], series: [
      { id: '900', name: 'A Series', poster: '', categoryId: '20', rating: 8, year: 2019, plot: 'p', genre: 'Drama' },
    ] }));
    if (p === `/api/providers/${PID}/series/900`) return r.fulfill(json({
      series: { id: '900', name: 'A Series', poster: '', categoryId: '20', rating: 8, year: 2019, plot: 'Series plot.', genre: 'Drama', backdrop: '', cast: '', director: '' },
      seasons: [
        { number: 1, name: 'Season 1', episodes: [{ id: '9011', season: 1, number: 1, title: 'Pilot', plot: 'First', durationMin: 45, still: '', ext: 'm3u8' }, { id: '9012', season: 1, number: 2, title: 'Two', plot: '', durationMin: 45, still: '', ext: 'm3u8' }] },
        { number: 2, name: 'Season 2', episodes: [{ id: '9021', season: 2, number: 1, title: 'Return', plot: '', durationMin: 45, still: '', ext: 'm3u8' }] },
      ],
    }));
    if (p === `/api/providers/${PID}/epg`) return r.fulfill({ status: 200, contentType: 'application/xml', body: '<tv></tv>' });
    return r.fulfill(json({ error: 'not_found' }, 404));
  });
  return posts;
}

test('connect Xtream from Sources: credentials go to the server once, the connection becomes the active source, and its channels play', async () => {
  const ctx = await newContext({ signedIn: true });
  const posts = await mockProviders(ctx);
  const { page, problems } = await open(ctx, '/tv/account/sources');
  await page.click('button:has-text("Xtream Codes")');
  await page.fill('#pf-name', 'My IPTV');
  await page.fill('#pf-server', 'http://xtream.example.com:8080');
  await page.fill('#pf-user', 'alice');
  await page.fill('#pf-pass', 's3cret');
  await page.click('button:has-text("Connect")');
  await page.waitForSelector('text=My IPTV');
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].config, { server: 'http://xtream.example.com:8080', username: 'alice', password: 's3cret' });

  const stored = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  assert.ok(!stored.includes('s3cret'), 'the password must not be kept in the browser');
  const active = await page.$$eval('.ac-source', (els) => els.filter((e) => e.innerText.includes('ACTIVE')).map((e) => e.innerText));
  assert.equal(active.length, 1);
  assert.match(active[0], /My IPTV/);
  assert.equal(await page.inputValue('#pf-pass').catch(() => ''), '', 'password field cleared after connecting');
  assert.deepEqual(problems, []);
  await page.close();

  const live = await open(ctx, '/tv/live?ch=1', { settle: 300 });
  assert.ok((await live.page.evaluate(() => document.body.innerText)).includes('Provider News HD'));
  assert.ok(await waitPlaying(live.page) >= 0, 'provider channel plays through the play route');
  await ctx.close();
});

test('a rejected provider login shows the reason and saves nothing', async () => {
  const ctx = await newContext({ signedIn: true });
  await mockProviders(ctx, { failAdd: true });
  const { page } = await open(ctx, '/tv/account/sources');
  await page.click('button:has-text("Stalker portal")');
  await page.fill('#pf-server', 'http://portal.example.com/stalker_portal/c/');
  await page.fill('#pf-mac', '00:1A:79:12:34:56');
  await page.click('button:has-text("Connect")');
  await page.waitForSelector('.ac-form-error');
  assert.match(await page.textContent('.ac-form-error'), /rejected/);
  assert.equal(await page.$$eval('.ac-source', (e) => e.length), 1, 'only the original playlist remains');
  await ctx.close();
});

for (const [devName, device] of [['phone', PHONE], ['desktop', DESKTOP]]) {
  test(`movies: catalogue, category filter, detail sheet, play, resume saved — ${devName}`, async () => {
    const ctx = await newContext({ device, signedIn: true });
    const added = [];
    await mockProviders(ctx, { added });
    await ctx.addInitScript((pid) => {
      try {
        const k = Object.keys(localStorage).find((x) => x.endsWith(':sources.live'));
        if (k && !localStorage.getItem('__prov')) {
          localStorage.setItem('__prov', '1');
          localStorage.setItem(k, JSON.stringify([{ id: 'prov-' + pid, kind: 'XC', title: 'My IPTV', sub: 'provider:' + pid, stat: '' }]));
          localStorage.setItem('ns.providerCaps', JSON.stringify({ [pid]: { live: true, vod: true, series: true, epg: true, catchup: true } }));
        }
      } catch { /* */ }
    }, PID);
    // the seed runs after the harness seed on the first load, so load once to apply it
    let { page } = await open(ctx, '/tv/home', { settle: 200 });
    await page.close();

    let problems;
    ({ page, problems } = await open(ctx, '/tv/movies'));
    assert.equal(await page.$$eval('.vod-card', (e) => e.length), 2);
    assert.deepEqual(await spill(page), []);
    await page.click('.vod-chip:has-text("Drama")');
    assert.deepEqual(await page.$$eval('.vod-grid .vod-name', (e) => e.map((x) => x.textContent)), ['Another Film']);
    await page.click('.vod-chip:has-text("All")');
    await page.fill('.vod-search', 'the mo');
    await page.click('.vod-grid .vod-card');
    await page.waitForSelector('.vod-sheet >> text=A gripping plot.');
    await page.click('.vod-sheet button:has-text("Play")');
    await page.waitForURL(/\/tv\/watch\?/);
    assert.ok(await waitPlaying(page) >= 0, 'movie plays');
    // Positions under 10 s are deliberately not saved (lib/vodProgress) and
    // the fixture is 12 s long, so seek past 10 s and pause to trigger a save.
    await page.evaluate(() => { const v = document.querySelector('video'); v.currentTime = 10.5; });
    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelector('video').pause());
    await page.waitForTimeout(300);
    const saved = await page.evaluate(() => Object.entries(localStorage).find(([k]) => k.endsWith(':vod.progress'))?.[1] || '');
    assert.match(saved, /"id":"501"/, 'resume position saved to the synced progress key');
    assert.deepEqual(problems, []);
    await ctx.close();
  });
}

test('series: seasons and episodes, episode plays, nav shows Movies/Series only when offered', async () => {
  const ctx = await newContext({ device: DESKTOP, signedIn: true });
  await mockProviders(ctx);
  await ctx.addInitScript((pid) => {
    try {
      const k = Object.keys(localStorage).find((x) => x.endsWith(':sources.live'));
      if (k && !localStorage.getItem('__prov')) {
        localStorage.setItem('__prov', '1');
        localStorage.setItem(k, JSON.stringify([{ id: 'prov-' + pid, kind: 'XC', title: 'My IPTV', sub: 'provider:' + pid, stat: '' }]));
        localStorage.setItem('ns.providerCaps', JSON.stringify({ [pid]: { live: true, vod: true, series: true, epg: true, catchup: true } }));
      }
    } catch { /* */ }
  }, PID);
  let { page } = await open(ctx, '/tv/live', { settle: 300 });
  await page.close();
  ({ page } = await open(ctx, '/tv/series'));
  const nav = await page.$$eval('.tv-nav a', (a) => a.map((x) => x.textContent.trim()));
  assert.ok(nav.includes('Movies') && nav.includes('Series'), `nav: ${nav}`);
  await page.click('.vod-card');
  await page.waitForURL(/\/tv\/series\/view/);
  await page.waitForSelector('text=Pilot');
  await page.click('[role=tab]:has-text("Season 2")');
  await page.waitForSelector('text=Return');
  await page.click('.vod-ep');
  await page.waitForURL(/k=episode/);
  assert.ok(await waitPlaying(page) >= 0, 'episode plays');
  await ctx.close();
});

test('without a provider, Movies explains what is needed and the nav hides Movies/Series', async () => {
  const ctx = await newContext({ device: DESKTOP });
  const { page } = await open(ctx, '/tv/movies');
  assert.ok(await page.$('a[href="/tv/account/sources"]'));
  assert.match(await page.textContent('.vod-empty'), /Xtream Codes or Stalker/);
  const nav = await page.$$eval('.tv-nav a', (a) => a.map((x) => x.textContent.trim()));
  assert.ok(!nav.includes('Movies') && !nav.includes('Series'));
  await ctx.close();
});

test('the watch page reports an unplayable title instead of spinning', async () => {
  const ctx = await newContext({ signedIn: true });
  await mockProviders(ctx);
  await ctx.route((u) => u.pathname.includes('/play/movie/'), (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"unsupported","message":"This title is not available."}' }));
  const { page } = await open(ctx, `/tv/watch?p=${PID}&k=movie&id=999&ext=mp4&t=Gone`);
  await page.waitForSelector('.watch-card');
  assert.match(await page.textContent('.watch-card'), /not available/);
  await ctx.close();
});
