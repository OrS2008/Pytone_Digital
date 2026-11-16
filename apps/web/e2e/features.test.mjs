// Reminders, search history, custom channel groups.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { newContext, open, closeBrowser, DESKTOP, PHONE, BASE } from './harness.mjs';

after(closeBrowser);

const stamp = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())} +0000`;
};

for (const [devName, device] of [['desktop', DESKTOP], ['phone', PHONE]]) {
  test(`guide: remind me on a future programme → toast → watch now — ${devName}`, async () => {
    const ctx = await newContext({ device });
    const now = Date.now();
    const xml = `<?xml version="1.0"?><tv>
      <channel id="c1"><display-name>News One</display-name></channel>
      <programme channel="c1" start="${stamp(now - 20 * 60e3)}" stop="${stamp(now + 65e3)}"><title>Morning Bulletin</title></programme>
      <programme channel="c1" start="${stamp(now + 65e3)}" stop="${stamp(now + 40 * 60e3)}"><title>The Big Match</title></programme>
    </tv>`;
    await ctx.addInitScript(() => {
      localStorage.setItem('ns:anon:sources.epg', JSON.stringify([{ id: 'epg-1', kind: 'xmltv', title: 'Guide', sub: 'https://epg.test/guide.xml', stat: '' }]));
    });
    await ctx.route((u) => u.pathname === '/api/epg', (r) => r.fulfill({ status: 200, contentType: 'application/xml', body: xml }));
    const { page, problems } = await open(ctx, '/tv/guide');
    const cell = page.locator('button.guide-remind', { hasText: 'The Big Match' });
    await cell.waitFor({ timeout: 15_000 });
    assert.equal(await cell.getAttribute('aria-pressed'), 'false');
    await cell.click();
    assert.equal(await cell.getAttribute('aria-pressed'), 'true');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ns:anon:epg.reminders') || '[]'));
    assert.equal(stored.length, 1);
    assert.equal(stored[0].title, 'The Big Match');
    assert.equal(stored[0].ch, '1');
    // Toggle off and on again — tapping again cancels.
    await cell.click();
    assert.equal(await cell.getAttribute('aria-pressed'), 'false');
    await cell.click();
    // The programme starts 65 s after load; reminders fire a minute early.
    const toast = page.locator('.ns-reminder-toast', { hasText: 'The Big Match' });
    await toast.waitFor({ timeout: 20_000 });
    assert.ok((await toast.innerText()).includes('News One'));
    await toast.locator('button.ns-reminder-watch').click();
    await page.waitForURL(/\/tv\/live\?ch=1$/, { timeout: 10_000 });
    // Fired reminders are consumed.
    const left = await page.evaluate(() => JSON.parse(localStorage.getItem('ns:anon:epg.reminders') || '[]'));
    assert.equal(left.length, 0);
    assert.deepEqual(problems, []);
    await ctx.close();
  });
}

test('search history: remembered, reused, removed, cleared, survives reload', async () => {
  const ctx = await newContext();
  let { page, problems } = await open(ctx, '/tv/search');
  assert.equal(await page.locator('.search-history').count(), 0, 'no history on first visit');
  await page.fill('input[type=search]', 'sport');
  await page.press('input[type=search]', 'Enter');
  await page.fill('input[type=search]', 'kids');
  await page.press('input[type=search]', 'Enter');
  await page.fill('input[type=search]', '');
  await page.waitForSelector('.search-history');
  const chips = () => page.$$eval('.search-history span > button:first-child', (b) => b.map((x) => x.textContent));
  assert.deepEqual(await chips(), ['kids', 'sport'], 'newest first');
  await page.close();

  ({ page } = await open(ctx, '/tv/search'));
  assert.deepEqual(await chips(), ['kids', 'sport'], 'kept after reload');
  await page.click('.search-history button:has-text("sport")');
  assert.equal(await page.inputValue('input[type=search]'), 'sport');
  assert.equal(await page.$$eval('a[href*="/tv/live?ch="]', (a) => a.length), 1);
  await page.fill('input[type=search]', '');
  await page.click('button[aria-label="Remove: kids"]');
  assert.deepEqual(await chips(), ['sport']);
  await page.click('.search-history button:has-text("Clear")');
  assert.equal(await page.locator('.search-history').count(), 0);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('channel groups: create, add channels, filter the live list, rename, delete', async () => {
  const ctx = await newContext({ device: DESKTOP, signedIn: true });
  let { page, problems } = await open(ctx, '/tv/account/groups');
  await page.fill('input[placeholder^="Group name"]', 'Family');
  await page.click('button:has-text("Create")');
  // Duplicate names are refused.
  await page.fill('input[placeholder^="Group name"]', 'family');
  await page.click('button:has-text("Create")');
  await page.waitForSelector('text=Enter a name that is not already used.');
  await page.fill('input[placeholder^="Group name"]', '');
  // The new group opens its channel picker.
  await page.fill('input[placeholder="Search channels to add"]', 'kids');
  await page.click('button[aria-pressed]:has-text("Kids Fun")');
  await page.fill('input[placeholder="Search channels to add"]', 'music');
  await page.click('button[aria-pressed]:has-text("Music Live")');
  await page.waitForSelector('.ac-card-title:has-text("Family · 2")');
  await page.close();

  ({ page } = await open(ctx, '/tv/live'));
  const rows = () => page.$$eval('.rail-row .rail-name', (n) => n.map((x) => x.textContent));
  assert.equal((await rows()).length, 5);
  await page.click('.rail-group:has-text("Family")');
  assert.deepEqual(await rows(), ['Kids Fun', 'Music Live']);
  // Tapping a filtered row plays the right channel.
  await page.click('.rail-row:has-text("Music Live")');
  await page.waitForFunction(() => document.body.innerText.includes('Music Live'));
  await page.goto(BASE + '/tv/live');
  await page.waitForSelector('.rail-row');
  await page.click('.rail-group:has-text("All")');
  assert.equal((await rows()).length, 5);
  await page.close();

  ({ page } = await open(ctx, '/tv/account/groups'));
  await page.click('button:has-text("Rename")');
  await page.fill('input[aria-label="Rename"]', 'Kids corner');
  await page.click('button:has-text("Save")');
  await page.waitForSelector('.ac-card-title:has-text("Kids corner · 2")');
  await page.click('button:has-text("Delete")');
  await page.click('button:has-text("Tap again to confirm")');
  await page.waitForSelector('text=No groups yet.');
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('legal pages: Hebrew translation, RTL, language switch, no dynamic "last updated" date', async () => {
  const ctx = await newContext({ locale: 'he' });
  for (const [route, he, en] of [['/legal/privacy', 'מדיניות פרטיות', 'Privacy policy'], ['/legal/terms', 'תנאי שימוש', 'Terms of service']]) {
    const { page, problems } = await open(ctx, route, { settle: 600 });
    assert.equal(await page.textContent('h1'), he);
    assert.equal(await page.getAttribute('main', 'dir'), 'rtl');
    assert.ok((await page.textContent('main')).includes('הנוסח האנגלי הוא הקובע'), 'prevailing-language notice');
    assert.ok((await page.textContent('main')).includes('16 בנובמבר 2026'));
    await page.click('button:has-text("English")');
    assert.equal(await page.textContent('h1'), en);
    assert.equal(await page.getAttribute('main', 'dir'), 'ltr');
    await page.click('button:has-text("עברית")');
    assert.deepEqual(problems, []);
    await page.close();
  }
  await ctx.close();
});
