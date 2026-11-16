// Browser regression suite. See ./README.md for how to run it and
// ./harness.mjs for exactly what is mocked.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE, PHONE, DESKTOP, LONG_NAMES,
  newContext, open, spill, waitPlaying, touchDriver, zoomState, closeBrowser,
} from './harness.mjs';

after(closeBrowser);

const APP_ROUTES = ['/tv/home', '/tv/live', '/tv/search', '/tv/guide', '/tv/catchup', '/tv/sports'];
const ACCOUNT_ROUTES = [
  '/tv/account', '/tv/account/subscription', '/tv/account/plans', '/tv/account/sources',
  '/tv/account/devices', '/tv/account/appearance', '/tv/account/help',
  '/tv/account/preferences', '/tv/account/security', '/tv/account/parental', '/tv/account/notifications',
];
const PUBLIC_ROUTES = ['/', '/tv/login', '/tv/signup', '/tv/forgot-password', '/tv/check-email', '/legal/terms', '/legal/privacy', '/admin/login'];

// ───────────────────────────── every screen loads cleanly ─────────────────────────────

for (const [devName, device] of [['phone', PHONE], ['desktop', DESKTOP]]) {
  for (const locale of ['en', 'he']) {
    test(`screens load without errors or sideways overflow — ${devName}, ${locale}`, async () => {
      const ctx = await newContext({ device, locale, signedIn: true, names: LONG_NAMES });
      const failures = [];
      for (const route of [...PUBLIC_ROUTES, ...APP_ROUTES, ...ACCOUNT_ROUTES]) {
        const { page, problems } = await open(ctx, route, { settle: 700 });
        const out = await spill(page);
        if (problems.length) failures.push(`${route}: ${problems.join(' | ')}`);
        if (out.length) failures.push(`${route}: content past the screen edge → ${out.join(', ')}`);
        if (locale === 'he' && route.startsWith('/tv')) {
          const dir = await page.evaluate(() => document.documentElement.dir);
          if (dir !== 'rtl') failures.push(`${route}: expected dir=rtl, got "${dir}"`);
        }
        await page.close();
      }
      await ctx.close();
      assert.deepEqual(failures, []);
    });
  }
}

test('channel names are rendered as text, never as markup', async () => {
  const ctx = await newContext({ names: LONG_NAMES });
  let dialog = false;
  for (const route of ['/tv/live', '/tv/home', '/tv/search']) {
    const { page } = await open(ctx, route);
    page.on('dialog', (d) => { dialog = true; d.dismiss(); });
    const injected = await page.evaluate(() => document.querySelectorAll('img[src="x"]').length);
    assert.equal(injected, 0, `${route}: playlist markup was injected into the DOM`);
    await page.close();
  }
  await ctx.close();
  assert.equal(dialog, false);
});

// ─────────────────────────────────── playback ───────────────────────────────────

for (const [devName, device] of [['phone', PHONE], ['desktop', DESKTOP]]) {
  test(`a channel deep link plays — ${devName}`, async () => {
    const ctx = await newContext({ device });
    const { page, problems } = await open(ctx, '/tv/live?ch=2', { settle: 300 });
    const ms = await waitPlaying(page);
    assert.ok(ms >= 0, 'video never started advancing');
    assert.deepEqual(problems, []);
    await ctx.close();
  });

  test(`a dead channel reports the real reason quickly — ${devName}`, async () => {
    const ctx = await newContext({ device });
    await ctx.route((u) => u.pathname === '/api/stream', (r) =>
      r.fulfill({ status: 502, contentType: 'text/plain', body: 'upstream returned 403' }));
    const page = await ctx.newPage();
    await page.goto(BASE + '/tv/live?ch=2', { waitUntil: 'networkidle' });
    await page.waitForSelector('.player-error-msg', { timeout: 25_000 });
    const msg = await page.textContent('.player-error-msg');
    assert.match(msg, /502/, `error card should carry the HTTP status, got: ${msg}`);
    await ctx.close();
  });

  test(`Direct streaming falls back to the proxy instead of failing — ${devName}`, async () => {
    const ctx = await newContext({ device, direct: true });
    let directHits = 0;
    await ctx.route((u) => u.pathname === '/api/stream' && u.searchParams.get('mode') === 'direct', (r) => {
      directHits++;
      r.fulfill({ status: 502, contentType: 'text/plain', body: 'direct broken' });
    });
    const page = await ctx.newPage();
    await page.goto(BASE + '/tv/live?ch=2', { waitUntil: 'networkidle' });
    const ms = await waitPlaying(page);
    assert.ok(directHits > 0, 'direct mode was never attempted');
    assert.ok(ms >= 0, 'did not recover through the proxy');
    assert.equal(await page.$('.player-error-msg'), null);
    await ctx.close();
  });
}

for (const [devName, device] of [['phone', PHONE], ['desktop', DESKTOP]]) {
  test(`raw MPEG-TS channel plays through mpegts.js — ${devName}`, async () => {
    const ctx = await newContext({ device });
    await ctx.route((u) => u.pathname === '/api/m3u', (r) => r.fulfill({
      status: 200, contentType: 'application/x-mpegurl',
      body: '#EXTM3U\n#EXTINF:-1 group-title="News",Raw TS Channel\nhttps://streams.test/raw/live.ts\n',
    }));
    const { page, problems } = await open(ctx, '/tv/live?ch=1', { settle: 300 });
    // The fixture is a finite file delivered instantly, so mpegts.js's live
    // latency chasing jumps to the live edge; "time keeps advancing" is
    // the wrong signal here. Decoded frames + no error is the right one.
    await page.waitForFunction(() => { const v = document.querySelector('video'); return v && v.readyState >= 3 && v.currentTime > 0; }, null, { timeout: 20000 });
    const src = await page.evaluate(() => document.querySelector('video')?.src || '');
    assert.match(src, /^blob:/, 'played via Media Source (mpegts.js), not a direct src');
    assert.equal(await page.$('.player-error-msg'), null);
    assert.deepEqual(problems, []);
    await ctx.close();
  });
}

test('home → tap a channel → it plays (phone)', async () => {
  const ctx = await newContext();
  const { page } = await open(ctx, '/tv/home');
  await page.click('a[href*="/tv/live?ch="]');
  assert.ok(await waitPlaying(page) >= 0);
  await ctx.close();
});

test('switching channels while playing keeps playing', async () => {
  const ctx = await newContext({ device: DESKTOP });
  const { page, problems } = await open(ctx, '/tv/live');
  for (let i = 0; i < 4; i++) {            // rapid zapping
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(150);
  }
  assert.ok(await waitPlaying(page) >= 0, 'nothing playing after rapid channel changes');
  assert.deepEqual(problems, []);
  await ctx.close();
});

// ───────────────────────────────── player gestures ─────────────────────────────────

test('pinch-to-zoom: zoom, pan clamp, double-tap, reset, pinch-to-close', async () => {
  const ctx = await newContext();
  const { page } = await open(ctx, '/tv/live?ch=2', { settle: 300 });
  assert.ok(await waitPlaying(page) >= 0);
  const t = await touchDriver(ctx, page);
  const { width: W, height: H } = page.viewportSize();
  const cx = W / 2, cy = H / 2;

  assert.equal((await zoomState(page)).scale, 1);

  await t.pinch(cx, cy, 40, 120);
  let s = await zoomState(page);
  assert.ok(s.scale > 2.5, `pinch-out should zoom in, got ${s.scale}`);
  assert.equal(s.badge, true, 'reset pill should show while zoomed');
  assert.equal(s.pageScale, 1, 'the PAGE must not zoom, only the picture');

  await t.drag(cx + 80, cy, cx - 900);
  s = await zoomState(page);
  assert.ok(Math.abs(s.x) <= (s.scale - 1) * W / 2 + 1, `pan must stop at the picture edge (x=${s.x})`);

  await t.doubleTap(cx, cy + 40);
  s = await zoomState(page);
  assert.equal(s.scale, 1, 'double-tap while zoomed resets');
  assert.equal(s.playing, true, 'double-tap must not leave playback paused');

  await t.doubleTap(cx, cy + 40);
  assert.equal((await zoomState(page)).scale, 2.5, 'double-tap at 1x zooms to 2.5x');

  await page.tap('.live-zoom-badge');
  await page.waitForTimeout(400);
  assert.equal((await zoomState(page)).scale, 1, 'reset pill resets');

  await t.pinch(cx, cy, 150, 40);
  assert.equal((await zoomState(page)).watching, false, 'pinch-in at 1x leaves fullscreen');
  await ctx.close();
});

test('the phone tab bar is hidden while the fullscreen player is open', async () => {
  const ctx = await newContext();
  const { page } = await open(ctx, '/tv/live?ch=2');
  const shown = await page.evaluate(() => getComputedStyle(document.querySelector('.ns-mtab')).display);
  assert.equal(shown, 'none');
  await ctx.close();
});

// ─────────────────────────────── playlists and search ───────────────────────────────

test('sources: inline edit, second playlist becomes active, old channels disappear', async () => {
  const ctx = await newContext({ signedIn: true });
  let nativeDialogs = 0;

  // watch something on playlist A so Continue Watching has an entry
  let { page } = await open(ctx, '/tv/live?ch=2');
  await waitPlaying(page);
  await page.close();

  ({ page } = await open(ctx, '/tv/account/sources'));
  page.on('dialog', (d) => { nativeDialogs++; d.dismiss(); });

  await page.click('button:has-text("Edit")');
  assert.equal(await page.inputValue('.ac-source-edit input[type=url]'), 'https://streams.test/list.m3u');
  assert.equal(nativeDialogs, 0, 'editing must not use a native prompt');
  await page.click('.ac-source-edit button:has-text("Cancel")');

  await page.fill('input[placeholder^="https://your-provider"]', 'https://streams.test/second.m3u');
  await page.fill('input[placeholder="e.g. My provider"]', 'Second list');
  await page.click('button:has-text("Add playlist")');
  await page.waitForTimeout(1200);
  const active = await page.$$eval('.ac-source', (els) =>
    els.filter((e) => e.innerText.includes('ACTIVE')).map((e) => e.querySelector('.ac-source-title').innerText));
  assert.equal(active.length, 1);
  assert.match(active[0], /Second list/);
  await page.close();

  ({ page } = await open(ctx, '/tv/search'));
  const text = await page.evaluate(() => document.body.innerText);
  assert.ok(text.includes('Planet Doc'), 'new playlist channels should be searchable');
  assert.ok(!text.includes('News One'), 'channels of the previous playlist must not be listed');
  await page.close();

  ({ page } = await open(ctx, '/tv/home'));
  const home = await page.evaluate(() => document.body.innerText);
  assert.ok(!home.includes('Sport Max'), 'Continue Watching must not list a channel from the old playlist');
  await ctx.close();
});

test('search: category chips filter and combine with text', async () => {
  const ctx = await newContext();
  const { page } = await open(ctx, '/tv/search');
  const results = () => page.$$eval('a[href*="/tv/live?ch="]', (a) => a.length);
  assert.equal(await results(), 5);
  await page.click('[role=tab]:has-text("News")');
  assert.equal(await results(), 2);
  await page.fill('input[type=search]', 'sport');
  assert.equal(await results(), 1);
  await page.fill('input[type=search]', 'zzzz-nothing');
  assert.equal(await results(), 0);
  assert.ok((await page.evaluate(() => document.body.innerText)).includes('No channels match'));
  await ctx.close();
});

// ─────────────────────────────── first run and forms ───────────────────────────────

test('first run with no playlist shows a call to action, not an empty screen', async () => {
  const ctx = await newContext({ noPlaylist: true });
  for (const route of ['/tv/home', '/tv/live']) {
    const { page, problems } = await open(ctx, route);
    assert.ok(await page.$('a[href*="/tv/account/sources"]'), `${route}: no "add playlist" link`);
    assert.deepEqual(problems, []);
    await page.close();
  }
  await ctx.close();
});

test('account screens show a sign-in wall when signed out', async () => {
  const ctx = await newContext();
  const { page } = await open(ctx, '/tv/account/sources');
  assert.ok(await page.$('a[href*="/tv/login"]'));
  assert.equal(await page.$('input[placeholder^="https://your-provider"]'), null);
  await ctx.close();
});

test('sign-up and login validate input before calling the server', async () => {
  const ctx = await newContext({ noPlaylist: true });
  let calls = 0;
  await ctx.route('**/api/auth/{login,signup}', (r) => { calls++; r.fulfill({ status: 500, body: '{}' }); });
  for (const route of ['/tv/signup', '/tv/login']) {
    const { page } = await open(ctx, route);
    // A malformed address is stopped by the browser's own email-field
    // validation, so the form never submits.
    await page.fill('input[type=email]', 'not-an-email');
    await page.fill('input[type=password]', 'longenough-password');
    await page.click('button[type=submit]');
    await page.waitForTimeout(400);
    // A short password is rejected by the app with a visible message.
    await page.fill('input[type=email]', 'a@b.co');
    await page.fill('input[type=password]', 'short');
    await page.click('button[type=submit]');
    await page.waitForSelector('.ah-err', { timeout: 5000 });
    assert.match(await page.textContent('.ah-err'), /8/);
    await page.close();
  }
  await ctx.close();
  assert.equal(calls, 0, 'invalid input must never reach the server');
});

test('Hebrew: landing page is translated in the first paint', async () => {
  const b = await (await import('./harness.mjs')).getBrowser();
  const ctx = await b.newContext({ ...PHONE, locale: 'he-IL', extraHTTPHeaders: { 'accept-language': 'he-IL,he;q=0.9' } });
  const res = await ctx.request.get(BASE + '/');
  assert.ok((await res.text()).includes('יצירת חשבון'), 'server HTML should already be Hebrew');
  await ctx.close();
});
