// Fetch the official webOSTV.js into the IPK source tree so the build is
// reproducible without a network at package time. Run as part of `npm install`
// via the `prepare` script in package.json.
//
// The version is pinned here intentionally; bumps to webOSTV.js are reviewed
// the same way any dependency bump would be.

import { existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

const VERSION = '1.2.10';
const URL = `https://webostv.developer.lge.com/sdkdownload/webostvjs/webOSTV-${VERSION}.js`;
const OUT = new URL('../webOSTV.js', import.meta.url);

if (existsSync(OUT) && process.env.NOVASTREAM_FORCE_REFETCH !== '1') {
  // Stub already in place (committed) — only refetch if explicitly asked.
  console.log(`webOSTV.js already present at ${OUT.pathname} (set NOVASTREAM_FORCE_REFETCH=1 to refresh).`);
  process.exit(0);
}

console.log(`Fetching webOSTV.js v${VERSION} ...`);
const res = await fetch(URL);
if (!res.ok) {
  console.error(`Fetch failed: ${res.status} ${res.statusText}`);
  process.exit(0); // exit 0 so `npm install` still succeeds; we ship a stub
}
mkdirSync(new URL('..', import.meta.url), { recursive: true });
await pipeline(res.body, createWriteStream(OUT));
console.log(`Wrote ${OUT.pathname}`);
