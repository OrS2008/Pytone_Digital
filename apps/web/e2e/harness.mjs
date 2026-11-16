// Shared fixtures for the browser suite.
//
// The suite runs against a real `next start` build. Everything that
// would need the outside world is intercepted here:
//
//   /api/m3u      → a small in-memory playlist
//   /api/stream   → the committed HLS fixture in ./fixtures/hls
//   /api/auth/me  → (signIn only) a trial account
//
// So these tests prove the CLIENT — player, gestures, layout, i18n,
// playlist management. They do not exercise the real proxy routes,
// Cloudflare KV, Firebase, Stripe, or a real provider's streams.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// require() rather than import: it also finds a globally installed
// Playwright (NODE_PATH), which ESM resolution ignores.
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HLS = path.join(HERE, 'fixtures', 'hls');

export const BASE = process.env.BASE_URL || 'http://localhost:3000';
export const PHONE = { ...devices['Pixel 7'] };
export const DESKTOP = { viewport: { width: 1366, height: 768 } };

export const SHORT_NAMES = ['News One', 'Sport Max', 'Cinema HD', 'Kids Fun', 'Music Live'];
export const LONG_NAMES = [
  'Cine Terror LATAM [Geo-blocked] (1080p)', 'EnerGeek (720p) [Not 24/7]',
  'EnerGeek Radio (1080p) Supercalifragilistic', 'DW Español (1080p)',
  'VeryLongChannelNameWithoutAnySpacesAtAll_HD_1080p_Backup2', 'ערוץ בעברית עם שם ארוך מאוד מאוד (HD)',
  '<img src=x onerror=alert(1)>', 'Kids Fun Time Network International (720p) [Geo-blocked]',
];

export function playlist(names, groups = ['News', 'Entertainment']) {
  return '#EXTM3U\n' + names.map((n, i) =>
    `#EXTINF:-1 tvg-id="c${i + 1}" group-title="${groups[i < 2 ? 0 : 1 % groups.length]}",${n}\n` +
    `https://streams.test/ch${i + 1}/index.m3u8`).join('\n') + '\n';
}

let browser;
export async function getBrowser() {
  browser ??= await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  return browser;
}
export async function closeBrowser() { await browser?.close(); browser = undefined; }

const EMAIL = 'dana@example.com';
function tenantOf(email) {
  let h = 0x811c9dc5;
  for (let i = 0; i < email.length; i++) {
    h ^= email.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return 'u' + h.toString(36);
}

/**
 * New browser context with a playlist configured and the network mocked.
 *
 *   device     PHONE | DESKTOP
 *   locale     'en' | 'he'
 *   names      channel names for the playlist
 *   signedIn   mock a signed-in trial account
 *   noPlaylist start with no playlist configured
 *   direct     turn the "Direct streaming" preference on
 */
export async function newContext({
  device = PHONE, locale = 'en', names = SHORT_NAMES,
  signedIn = false, noPlaylist = false, direct = false,
} = {}) {
  const b = await getBrowser();
  const ctx = await b.newContext(device);
  const tenant = signedIn ? tenantOf(EMAIL) : 'anon';

  // Seed once per context: later navigations must see what the app
  // itself wrote (e.g. a second playlist added through the UI).
  await ctx.addInitScript(({ tenant, locale, signedIn, noPlaylist, direct, email }) => {
    try {
      if (localStorage.getItem('__seeded')) return;
      localStorage.setItem('__seeded', '1');
      localStorage.setItem('ns.locale', locale);
      if (signedIn) {
        localStorage.setItem('ns.session.email', email);
        localStorage.setItem('ns.session.activated', '1');
      }
      if (!noPlaylist) {
        localStorage.setItem(`ns:${tenant}:sources.live`, JSON.stringify([
          { id: 'live-x', kind: 'm3u', title: 'Test list', sub: 'https://streams.test/list.m3u', stat: '' },
        ]));
      }
      if (direct) localStorage.setItem(`ns:${tenant}:prefs.streamMode`, '"direct"');
    } catch { /* storage unavailable */ }
  }, { tenant, locale, signedIn, noPlaylist, direct, email: EMAIL });

  await ctx.route((u) => u.pathname === '/api/m3u', (r) => {
    const target = new URL(r.request().url()).searchParams.get('url') || '';
    const body = /second/.test(target)
      ? playlist(['Planet Doc', 'History Now', 'Film One'], ['Docs', 'Films'])
      : playlist(names);
    r.fulfill({ status: 200, contentType: 'application/x-mpegurl', body });
  });

  await ctx.route((u) => u.pathname === '/api/stream', (r) => {
    const target = new URL(r.request().url()).searchParams.get('url') || '';
    if (target.endsWith('.m3u8')) {
      const body = fs.readFileSync(path.join(HLS, 'index.m3u8'), 'utf8')
        .replace(/^(seg\d+\.ts)$/gm, (m) => '/api/stream?url=' + encodeURIComponent('https://streams.test/' + m));
      return r.fulfill({ status: 200, contentType: 'application/vnd.apple.mpegurl', body });
    }
    const f = path.join(HLS, path.basename(target));
    if (fs.existsSync(f)) return r.fulfill({ status: 200, contentType: 'video/mp2t', body: fs.readFileSync(f) });
    return r.fulfill({ status: 404, body: '' });
  });

  // The guide asks the server to digest the playlist + EPG. The server
  // cannot reach the fake playlist host, so answer the way it would for
  // an unreachable provider; the guide must cope with that.
  await ctx.route('**/api/playlist/digest', (r) =>
    r.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"upstream_unreachable"}' }));

  if (signedIn) {
    const now = Date.now();
    const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
    await ctx.route('**/api/auth/me', (r) => r.fulfill(json({
      user: { userId: 'u1', email: EMAIL, createdAt: now - 2 * 864e5 },
      access: { status: 'trial', trialEndsAt: now + 5 * 864e5, subscribedUntil: 0, daysLeft: 5 },
    })));
    await ctx.route('**/api/settings', (r) => r.fulfill(json({}, 401)));
    await ctx.route('**/api/auth/sessions', (r) => r.fulfill(json({ sessions: [] })));
    await ctx.route('**/api/billing/status', (r) => r.fulfill(json({ state: 'none' })));
  }
  return ctx;
}

/** Open a page and collect everything that counts as a client-side failure. */
export async function open(ctx, route, { settle = 1200 } = {}) {
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // Account APIs need Cloudflare KV, which a local `next start` does
    // not have; their 401/503 is expected here.
    // …and the mocked digest above answers 502 on purpose.
    if (/status of (401|502|503)/.test(t)) return;
    problems.push('console: ' + t.slice(0, 200));
  });
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(settle);
  return { page, problems };
}

/** Elements that poke out past the left/right edge and are not inside a horizontal scroller. */
export function spill(page) {
  return page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => {
    const b = e.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) return false;
    if (!(b.right > innerWidth + 2 || b.left < -2)) return false;
    // Deliberately hidden helpers (e.g. the preview tile's snapshot
    // <video>, parked at left:-10000px) are not layout defects.
    if (e.closest('[aria-hidden="true"]')) return false;
    for (let a = e.parentElement; a; a = a.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(a).overflowX)) return false;
      // Carousels (the desktop home rows) clip with overflow:hidden and
      // scroll by script; tiles parked off to the side are intended.
      if (/(^|[\s_-])(row|rail|carousel|scroller)([\s_-]|$)/i.test(String(a.className))) return false;
    }
    return true;
  }).map((e) => (e.className && String(e.className).slice(0, 50)) || e.tagName).slice(0, 5));
}

/** Wait until a <video> is genuinely advancing (not just "attached"). */
export async function waitPlaying(page, timeoutMs = 20_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const a = await page.evaluate(() => document.querySelector('video')?.currentTime ?? -1);
    await page.waitForTimeout(600);
    const b = await page.evaluate(() => document.querySelector('video')?.currentTime ?? -1);
    if (a >= 0 && b > a) return Date.now() - t0;
  }
  return -1;
}

/** Real multi-touch input through the DevTools protocol. */
export async function touchDriver(ctx, page) {
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })),
  });
  return {
    touch,
    async pinch(cx, cy, d0, d1, steps = 10) {
      await touch('touchStart', [[cx - d0, cy], [cx + d0, cy]]);
      for (let i = 1; i <= steps; i++) {
        const d = d0 + (d1 - d0) * i / steps;
        await touch('touchMove', [[cx - d, cy], [cx + d, cy]]);
        await page.waitForTimeout(16);
      }
      await touch('touchEnd', []);
      await page.waitForTimeout(350);
    },
    async doubleTap(x, y) {
      for (let i = 0; i < 2; i++) {
        await touch('touchStart', [[x, y]]);
        await touch('touchEnd', []);
        await page.waitForTimeout(80);
      }
      await page.waitForTimeout(400);
    },
    async drag(x0, y, x1, steps = 10) {
      await touch('touchStart', [[x0, y]]);
      for (let i = 1; i <= steps; i++) await touch('touchMove', [[x0 + (x1 - x0) * i / steps, y]]);
      await touch('touchEnd', []);
      await page.waitForTimeout(300);
    },
  };
}

export function zoomState(page) {
  return page.evaluate(() => {
    const o = document.querySelector('.live-player-overlay');
    const v = o?.querySelector('video');
    const m = /scale\(([\d.]+)\)/.exec(v?.style.transform || '');
    const t = /translate3d\((-?[\d.]+)px/.exec(v?.style.transform || '');
    return {
      watching: !!o,
      scale: m ? Number(m[1]) : 1,
      x: t ? Number(t[1]) : 0,
      badge: !!document.querySelector('.live-zoom-badge'),
      pageScale: window.visualViewport?.scale ?? 1,
      playing: v ? !v.paused : null,
    };
  });
}
