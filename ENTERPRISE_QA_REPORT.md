# Enterprise QA Report — Transformation Round

**Date:** 16 November 2026 · Supersedes the test sections of `ENTERPRISE_QA_AUDIT_REPORT.md` (15 Nov). Status labels: see `KNOWN_LIMITATIONS_AND_BLOCKERS.md`.

## 1. Final regression (after the last code change)

| Suite | Command (`apps/web/e2e`) | Total | Pass | Fail | What it runs against |
|---|---|---:|---:|---:|---|
| Unit | `npm run test:unit` | 5 | 5 | 0 | Pure modules (SSRF guard, billing mapping, M3U parser, URL masking) |
| API integration + security | `npm run test:integration` | 44 | 44 | 0 | **Real route handlers** in Node, in-memory KV, scripted network |
| Browser (Chromium) | `npm run test:browser` | 31 | 31 | 0 | Production build (`next start`), phone + desktop, en + he, mocked provider network |
| Type-check, lint, `next build`, Cloudflare `next-on-pages` build | — | 4 | 4 | 0 | |
| Dependency audit (prod) | `npm audit --omit=dev` | 1 | 1 | 0 | 0 vulnerabilities |
| GitHub CI web job (on push `4199681`) | `ci.yml` | 1 | 1 | 0 | Same suites on GitHub's runner |
| Android APK build (CI) | `android-apk.yml` | 1 | 1 | 0 | Debug build (no owner keystore yet) |
| Cloudflare runtime smoke (manual, once) | `wrangler pages dev` + local KV | 6 | 6 | 0 | Pages render, `/api/auth/me` with seeded session, anonymous proxy → 401, SSRF refusals |

## 2. Integration tests (44)

| Group | Tests | Highlights |
|---|---:|---|
| Proxy access control | 15 | 5 routes × (anonymous with forged Referer/Origin → 401 and no upstream call · expired → 402 · forged session → 401 · KV missing/erroring → 503) |
| Proxy behaviour | 3 | Signed-in proxying and manifest rewrite incl. key URIs · per-account 429 · CORS allow-list |
| Stream tokens | 2 | Credentials never visible in token, manifest or segment URLs · bound to user (other user → 403) · tamper → 403 · expiry |
| SSRF | 3 | Private IPv4/IPv6 and alternative spellings · DNS rebinding · redirect into metadata · DoH outage fails closed · 5 MB manifest refused |
| Encryption / settings | 5 | AES-GCM round-trip, AAD binding, tamper, key rotation · settings ciphertext in KV · cross-account blob → 503 · legacy plaintext · malformed/oversized → 400/413 · honest `encrypted:false` |
| Rate limiter | 1 | Fails closed; valid TTL for short windows |
| Billing (Stripe webhook) | 3 | Signed `checkout.session.completed` grants, `subscription.deleted` revokes · forged/unsigned rejected with no Stripe calls · duplicate processed once |
| Providers | 12 | Xtream and Stalker clients against protocol mocks; API routes; IDOR; malformed input |

Mutation check: removing the gate from `/api/stream` made 3 of its tests fail (then restored).

## 3. Browser tests (31)

- **Every screen** (8 public + 6 app + 11 account routes) on phone and desktop, English and Hebrew: no uncaught errors, no content past the screen edge, RTL in Hebrew — 4 tests × 25 routes.
- **Playback:** deep link plays (phone, desktop) · dead channel shows the real HTTP reason quickly (phone, desktop) · Direct-streaming falls back to the proxy (phone, desktop) · **raw MPEG-TS decodes via mpegts.js** (phone, desktop) · home → tap → plays · rapid channel switching.
- **Gestures:** pinch-zoom, pan clamp, double-tap, reset, pinch-to-close (real multi-touch via DevTools).
- **Playlists:** inline edit without native prompt · second playlist becomes active · old channels removed from search and Continue Watching.
- **Providers UI:** connect Xtream (password never stored in the browser; source becomes active; its channels play) · rejected login shows reason, saves nothing · Movies catalogue → category filter → search → detail sheet → play → resume saved (phone, desktop) · Series → season tab → episode plays · capability-gated nav · empty state without provider · unplayable title shows an error card · unified search returns movies and series.
- **Forms & first run:** call-to-action with no playlist · account sign-in wall · login/sign-up validation without server calls · Hebrew landing in server HTML · playlist markup never injected (XSS).

## 4. Performance measurements (local Chromium, mocked network)

| Metric | Result |
|---|---|
| Time to first frame, cold deep link | phone 264–324 ms · desktop 401–443 ms (previous round; player path unchanged except TS) |
| Channel switch (30) | median 134 ms, p90 150 ms; 1 `<video>` element after 30 switches |
| 20 000-channel playlist, ready | ~1.05 s phone, ~1.07 s desktop |
| 20 000 channels, extreme fling (≈54 000 px/s, 6 s) | phone p95 frame 67 ms (13 frames > 50 ms) · desktop p95 33 ms (3 frames > 50 ms) |
| Lighthouse (previous round) | landing 98/98/100, login 99/100/96 (perf/a11y/best practices) |

These describe the client only; real-world startup is dominated by the provider and the proxy hop.

## 5. Defects found and fixed in this round

| # | Defect | Severity | Found by | Fix |
|---|---|---|---|---|
| 1 | Proxies open to anyone (forgeable Referer) | High | Audit | `viewerAuth` gate |
| 2 | Rate limiter fails open; KV TTL < 60 s made short windows silently fail open | Medium | Test (MemoryKV enforces KV's TTL rule) | Fail closed; TTL floor |
| 3 | DNS-rebinding check fails open on DoH outage | Medium | Review | Fail closed |
| 4 | Undecryptable settings returned as `{}` (client overwrite → data loss) | Medium | Test design | 503 |
| 5 | CORS echoed any Origin | Low | Review | Allow-list |
| 6 | Next.js advisories (1 critical, 4 high) + 4 transitive | High | `npm audit` | Upgrade + overrides |
| 7 | Webhook idempotency in isolate memory only | Low | Review | KV marker |
| 8 | Provider config accepted `ftp://x` as host "ftp" | Low | Test | Scheme check |
| 9 | Watch page re-fetched the stream every render | High (UX/cost) | Test | Stable translator ref |
| 10 | CSP blocked blob workers (mpegts.js dead; hls.js main-thread fallback in production) | High | Test | `worker-src 'self' blob:` |
| 11 | Intermittent "screens load" failure | Test flake | Captured log | Hidden snapshot `<video>` marked `aria-hidden`; check skips it |

## 6. Not tested (with reason)

Real Xtream / Stalker providers (B3) · Stripe test-mode checkout (B4) · Firebase flows (B5) · Android device behaviour, signed release, Android TV (B6, B7) · LG webOS (B8) · Firefox, Safari, iOS (B9) · audio/subtitle track switching (no multi-track fixture) · auto-next end to end · hours-long live sessions through the proxy · load testing.

## 7. How to reproduce

```bash
cd apps/web && npm ci && npm run build && npx next start -p 3000 &
cd apps/web/e2e && npm install && npx playwright install chromium && npm test
```
