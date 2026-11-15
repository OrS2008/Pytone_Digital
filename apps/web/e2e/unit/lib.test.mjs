// Unit tests for the import-free library modules. Node runs the .ts
// sources directly (type stripping), so there is no build step.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateUpstreamUrl } from '../../src/lib/ssrfGuard.ts';
import { subscribedUntilFor, RENEWAL_GRACE_MS } from '../../src/lib/billingAccess.ts';
import { parseM3U } from '../../src/lib/m3u.ts';
import { maskSourceUrl } from '../../src/lib/maskUrl.ts';

const refused = (u) => 'reason' in validateUpstreamUrl(u);

test('SSRF guard refuses internal targets in every spelling', () => {
  for (const u of [
    'http://localhost/x', 'http://127.0.0.1/x', 'http://127.1/x', 'http://2130706433/x',
    'http://0x7f000001/x', 'http://0177.0.0.1/x', 'http://10.0.0.5/x', 'http://192.168.1.1/x',
    'http://172.16.0.1/x', 'http://169.254.169.254/latest/meta-data', 'http://100.64.0.1/x',
    'http://[::1]/x', 'http://[::ffff:127.0.0.1]/x', 'http://[fe80::1]/x', 'http://[fd00::1]/x',
    'http://metadata.google.internal/x', 'http://foo.local/x', 'http://0.0.0.0/x',
    'file:///etc/passwd', 'gopher://example.com/', 'ftp://example.com/x',
    'http://user:pass@example.com/x', 'http://example.com:22/x', 'http://example.com:6379/x',
    'not a url', '',
  ]) assert.ok(refused(u), `should refuse ${u}`);
});

test('SSRF guard allows ordinary provider URLs', () => {
  for (const u of [
    'http://provider.tv/get.php?username=a&password=b&type=m3u_plus',
    'https://cdn.example.com:8443/live/1.m3u8', 'http://93.184.216.34:8080/x.ts',
  ]) assert.ok(!refused(u), `should allow ${u}`);
});

test('subscription → access window', () => {
  const end = 1_800_000_000;
  const sub = (status, extra = {}) => ({ status, items: { data: [{ current_period_end: end }] }, ...extra });
  for (const s of ['active', 'trialing', 'past_due']) {
    assert.equal(subscribedUntilFor(sub(s)), end * 1000 + RENEWAL_GRACE_MS, s);
  }
  for (const s of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused']) {
    assert.equal(subscribedUntilFor(sub(s)), 0, s);
  }
  // trial end later than the period end wins; missing data means no access
  assert.equal(subscribedUntilFor(sub('trialing', { trial_end: end + 500 })), (end + 500) * 1000 + RENEWAL_GRACE_MS);
  assert.equal(subscribedUntilFor({ status: 'active' }), 0);
});

test('M3U parser: attributes, commas in names, junk tolerated', () => {
  const ch = parseM3U([
    '#EXTM3U',
    '#EXTINF:-1 tvg-id="a.b" tvg-logo="https://x/l.png" group-title="News, World",BBC, World News',
    'http://p.tv/1.m3u8',
    '',
    '#EXTINF:-1,No Attributes',
    '#EXTVLCOPT:http-user-agent=Foo',
    'http://p.tv/2.ts',
    '#EXTINF:-1 group-title="X",Orphan with no url',
    '#EXTINF:-1 tvg-name="<script>alert(1)</script>",<b>Bold</b>',
    'http://p.tv/3.m3u8',
  ].join('\r\n'));
  assert.equal(ch.length, 3);
  assert.equal(ch[0].name, 'BBC, World News');
  assert.equal(ch[0].category, 'News, World');
  assert.equal(ch[0].logoUrl, 'https://x/l.png');
  assert.equal(ch[0].streamUrl, 'http://p.tv/1.m3u8');
  assert.equal(ch[1].name, 'No Attributes');
  assert.equal(ch[2].name, '<b>Bold</b>');            // kept verbatim; the UI renders it as text
  assert.deepEqual(ch.map((c) => c.number), [1, 2, 3]);
  assert.deepEqual(parseM3U(''), []);
  assert.deepEqual(parseM3U('<html>not a playlist</html>'), []);
});

test('playlist URLs are masked before display', () => {
  const masked = maskSourceUrl('http://provider.tv/get.php?username=alice&password=s3cret&type=m3u');
  assert.ok(!masked.includes('s3cret') && !masked.includes('alice'), masked);
});
