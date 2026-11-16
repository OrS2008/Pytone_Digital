# apps/web regression suite

Two layers, both run with Node's built-in test runner (no extra framework):

| Layer | Command | What it covers |
| --- | --- | --- |
| Unit | `npm run test:unit` | SSRF guard, Stripe subscription → access mapping, M3U parser, URL masking |
| API integration + security | `npm run test:integration` | Real route handlers in Node (`integration/loader.mjs` maps `@/` and stubs the Cloudflare context), in-memory KV, scripted network: proxy access control, SSRF, stream tokens, encryption, settings, rate limits, Stripe webhook, Xtream/Stalker providers |
| Browser | `npm run test:browser` | Every screen on phone + desktop in English + Hebrew, playback, failure reporting, Direct-streaming fallback, pinch-to-zoom gestures, playlist management, search, first-run and form validation |

## Running

```bash
cd apps/web && npm ci && npm run build && npx next start -p 3000 &
cd apps/web/e2e && npm install && npx playwright install chromium && npm test
```

`BASE_URL` overrides the default `http://localhost:3000`.

## What is mocked — read before trusting a green run

The browser tests intercept `/api/m3u`, `/api/stream` and (for signed-in
cases) `/api/auth/me`, and play a 12-second test pattern committed under
`fixtures/hls`. They therefore verify the **client**. They do **not**
verify the real stream proxy against a real provider, Cloudflare KV,
Firebase sign-in, Stripe, or the Android APK.
