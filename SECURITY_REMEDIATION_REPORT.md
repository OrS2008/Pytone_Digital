# Security Remediation Report

**Date:** 16 November 2026 · Baseline: `ENTERPRISE_QA_AUDIT_REPORT.md` (15 Nov 2026)
Evidence for every PASS is an automated test in `apps/web/e2e` that ran against the real route handlers (see `ENTERPRISE_QA_REPORT.md`). Status labels are defined in `KNOWN_LIMITATIONS_AND_BLOCKERS.md`.

## Summary

| # | Baseline finding | Severity | Status | Fix |
|---|---|---|---|---|
| 1 | Stream / playlist / EPG / probe / digest proxies open to anyone (forgeable Referer check) | High | **PASS** | Server-side session + active-access gate on all five (`lib/viewerAuth.ts`) |
| 2 | No per-account rate limits on proxies; Google sign-in unthrottled | Medium | **PASS** | Per-account limits on playlist/EPG/probe/digest/provider APIs; per-IP limit on Google sign-in |
| 3 | Trial enforced only by a client overlay | Medium | **PASS** | 402 from every content route when access has ended |
| 4 | Provider credentials in plain JSON in KV | Medium | **PASS** (code) / **BLOCKED** (prod key, B2) | AES-256-GCM `lib/secretBox.ts`; settings blob and provider store encrypted, user-bound |
| 5 | Credential-bearing URLs exposed to the browser | Medium | **PASS** for Xtream/Stalker · **PARTIAL** for M3U | Sealed, user-bound stream tokens; provider credentials never sent to the client |
| 6 | UI claimed encryption that did not exist | Medium | **PASS** | Copy corrected earlier; API now reports `encrypted: true/false` truthfully |
| 7 | Rate limiter fails open; KV TTL < 60 s silently broke short windows | Low→Medium | **PASS** | Fails closed; TTL floor 60 s |
| 8 | DNS-rebinding check fails open when DoH is down | Medium | **PASS** | Fails closed |
| 9 | Unbounded manifest buffering | Low | **PASS** | 4 MB cap |
| 10 | CORS reflected any Origin on proxies | Low | **PASS** | Only own host / `ALLOWED_HOSTS` |
| 11 | Next.js 15.4.11: 1 critical + 4 high advisories; postcss, sharp, nanoid, source-map-js | High | **PASS** | Next 15.5.29 + overrides; `npm audit` → 0; CI audit gate |
| 12 | Stripe entitlement never recorded | Critical | **PASS** (simulated) / **BLOCKED** (test-mode E2E, B4) | Webhook writes `subscribedUntil`; signed-event tests |
| 13 | Webhook idempotency only in isolate memory | Low | **PASS** | KV marker per event id (7 days) |
| 14 | Android: new debug key every build | High | **PARTIAL** | Release signing from owner secrets, verified with apksigner; needs B6 |
| 15 | Android: no network security config | Low | **PASS** (config) / NOT TESTED (device) | No cleartext; system CAs only |
| 16 | Settings write accepted any JSON shape | Low | **PASS** | Object-only, size checked before buffering |
| 17 | Undecryptable settings returned as `{}` (client would overwrite) | Medium (data loss) | **PASS** | 503 instead |
| 18 | Webhook / provider errors echoed internals | Low | **PASS** | Generic bodies; details to logs (URLs redacted) |
| — | CSP allows `'unsafe-inline'` scripts | Low | **NOT DONE** | Needs nonce support through the Cloudflare adapter |
| — | Penetration test against the deployed site | — | **BLOCKED** | Site not reachable from this environment |

## Details

### 1–3. Proxy access control — `apps/web/src/lib/viewerAuth.ts`
- **Architecture.** `requireViewer(req, { limit })` reads the `ns_session` cookie, loads the session and user from KV, computes access (`trial` / `subscribed` / `expired`), and returns 401 / 402 / 503 or the viewer. A 60-second per-isolate decision cache keeps segment requests off KV; revocation and trial expiry take effect within a minute. Applied to `/api/stream`, `/api/m3u`, `/api/epg`, `/api/stream/probe`, `/api/playlist/digest` and every `/api/providers/*` route.
- **Fails closed.** Missing KV binding or KV error → 503, never pass-through.
- **Rate limits (per account, 5-minute windows):** playlist 30, EPG 20, probe 120, digest 20, provider API 120, provider add 10 / 10 min. Google sign-in 20 per IP / 10 min. Segment requests are not counted (KV writes per segment would be cost-prohibitive and hit KV's 1 write/s/key limit); they are covered by authentication.
- **Tests:** 15 parametrised tests (5 routes × anonymous-with-forged-Referer, expired/invalid session, KV missing/erroring), rate limit 429, CORS. A mutation check (gate removed) made 3 tests fail, confirming they detect regressions.
- **Impact:** anonymous playback is no longer possible (see Limitations §2).

### 4–6. Credentials at rest and in transit
- **`lib/secretBox.ts`** — AES-256-GCM, random 96-bit IV, key id in the ciphertext, additional authenticated data (e.g. `settings:<userId>`) so a blob moved to another account fails to open. Keys: `NOVA_ENCRYPTION_KEY`, rotation via `NOVA_ENCRYPTION_KEY_PREVIOUS` (old ciphertexts open and are re-sealed on next write).
- **Settings blob** (`lib/settingsStore.ts`) — encrypted on write when the key exists; legacy plaintext still readable; reports `encrypted` honestly.
- **Provider store** (`lib/providers/store.ts`) — refuses to save without the key (503 `encryption_not_configured`). `publicView()` returns host + masked username / MAC only.
- **Stream tokens** (`lib/streamToken.ts`) — upstream URL + expected headers sealed with the user id and an 8-hour expiry. `/api/stream?t=` opens it only for the same user; segment URLs inside such manifests are sealed again. Tests check that neither the token, the manifest, nor any provider API response contains the password or username.
- **M3U:** URLs typed by the user remain in their browser (by design of the client-side parser).

### 7–10. Fail-closed behaviour and SSRF
- Rate limiter returns "not allowed" on KV read/write failure; TTL floor 60 s (KV rejects shorter TTLs — previously that made the 10-second-window paths silently fail open).
- SSRF guard (existing): strict parsing, scheme allow-list, private/reserved IPv4/IPv6 incl. IPv4-mapped and alternative notations, blocked names and ports, per-hop redirect validation, DoH resolution check. **New:** DoH failure refuses the request; manifests capped at 4 MB; provider configs reject foreign schemes (`ftp://x` was previously "fixed" into host `ftp`). Cloudflare Workers additionally cannot reach private networks.
- **Tests:** 26 hostile URL spellings (unit), DNS rebinding to 10.x, redirect into 169.254.169.254, DoH outage, oversized manifest.

### 11. Dependencies
`next` 15.4.11 → 15.5.29, `eslint-config-next` 15.5.29, overrides for `postcss`, `sharp`, `nanoid`, `source-map-js`, and an override of `@cloudflare/next-on-pages`' stale peer range. Verified: `npm ci`, type-check, lint, `next build`, `next-on-pages` build, the built worker served by `wrangler pages dev` (workerd) with local KV, and all test suites. CI now fails on any production-dependency advisory.

### 12–13. Billing
Webhook verifies the Stripe signature (unchanged), writes `subscribedUntil` (period end + 36 h grace for `active` / `trialing` / `past_due`; 0 otherwise) and deduplicates via KV. Tests sign events with Stripe's own helper and the test secret: grant on `checkout.session.completed`, revoke on `customer.subscription.deleted`, forged/unsigned events rejected with no Stripe calls, duplicates processed once. **Refunds:** entitlement follows subscription status; a refund without cancellation does not revoke access (business decision — documented, not changed).

### 14–15. Android
See `ARCHITECTURE_AND_DEPLOYMENT_CHANGES.md` → Android signing. `allowBackup=false` (earlier), `usesCleartextTraffic=false`, network security config, single exported activity with verified https deep links, WebView debugging off, mixed content blocked.

## Remaining risks
1. Production key not yet configured (B2) — encryption is code-complete but inactive until then.
2. No live penetration test; no Stripe/Firebase end-to-end.
3. `'unsafe-inline'` in CSP.
4. Deprecated Cloudflare adapter (`next-on-pages`) — patched today, but future Next.js fixes may again outrun its peer range.
5. KV has no transactions: concurrent updates to one user record (webhook vs. admin action) can race.
