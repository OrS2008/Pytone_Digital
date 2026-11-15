// Measurements, not assertions: `node perf.mjs` prints timings for the
// report. Same mocked network as the test suite (see harness.mjs), so
// these numbers describe the client, not a real provider or network.

import { PHONE, DESKTOP, newContext, waitPlaying, closeBrowser, BASE } from './harness.mjs';

const big = Array.from({ length: 5000 }, (_, i) => `Channel ${i + 1} ${'HD FHD 4K'.split(' ')[i % 3]}`);
const out = {};

// 1. time to first frame, cold deep link
for (const [name, device] of [['phone', PHONE], ['desktop', DESKTOP]]) {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await newContext({ device });
    const page = await ctx.newPage();
    const t0 = Date.now();
    await page.goto(BASE + '/tv/live?ch=2', { waitUntil: 'commit' });
    await page.waitForFunction(() => (document.querySelector('video')?.currentTime ?? 0) > 0, null, { timeout: 30000 });
    runs.push(Date.now() - t0);
    await ctx.close();
  }
  out[`timeToFirstFrame_ms_${name}`] = runs;
}

// 2. channel switch time + leak check over 30 switches (desktop, keyboard)
{
  const ctx = await newContext({ device: DESKTOP });
  const page = await ctx.newPage();
  await page.goto(BASE + '/tv/live', { waitUntil: 'networkidle' });
  await waitPlaying(page);
  const cdp = await ctx.newCDPSession(page);
  const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); return Math.round((await cdp.send('Runtime.getHeapUsage')).usedSize / 1048576 * 10) / 10; };
  const before = await heap();
  const times = [];
  for (let i = 0; i < 30; i++) {
    const key = i % 8 < 4 ? 'ArrowDown' : 'ArrowUp';
    const t0 = Date.now();
    await page.keyboard.press(key);
    await page.waitForFunction(() => { const v = document.querySelector('video'); return v && v.currentTime > 0 && v.currentTime < 1.5 && !v.paused; }, null, { timeout: 15000 }).catch(() => {});
    times.push(Date.now() - t0);
  }
  times.sort((a, b) => a - b);
  out.channelSwitch_ms = { median: times[15], p90: times[26], max: times[29] };
  out.heapMB = { before, after30Switches: await heap() };
  out.videoElementsAfter = await page.evaluate(() => document.querySelectorAll('video').length);
  await ctx.close();
}

// 3. 5,000-channel playlist on a phone
{
  const ctx = await newContext({ names: big });
  const cdp0 = await ctx.newPage();
  await cdp0.close();
  for (const route of ['/tv/live', '/tv/home', '/tv/search']) {
    const page = await ctx.newPage();
    const t0 = Date.now();
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    const ready = Date.now() - t0;
    const nodes = await page.evaluate(() => document.querySelectorAll('*').length);
    // scroll hard and measure the worst frame gap
    const worstFrame = await page.evaluate(async () => {
      let worst = 0, last = performance.now();
      const stop = performance.now() + 2500;
      await new Promise((res) => {
        const step = (now) => {
          worst = Math.max(worst, now - last); last = now;
          window.scrollBy(0, 400);
          now < stop ? requestAnimationFrame(step) : res();
        };
        requestAnimationFrame(step);
      });
      return Math.round(worst);
    });
    const nodesAfter = await page.evaluate(() => document.querySelectorAll('*').length);
    out[`big5000${route.replace(/\//g, '_')}`] = { ready_ms: ready, domNodes: nodes, domNodesAfterScroll: nodesAfter, worstFrame_ms: worstFrame };
    await page.close();
  }
  await ctx.close();
}

console.log(JSON.stringify(out, null, 1));
await closeBrowser();
