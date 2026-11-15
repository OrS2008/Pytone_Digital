# Nova Stream — Enterprise QA Audit Report

**Date:** 15 November 2026 · **Branch:** `claude/nextgen-iptv-platform-rEZiD` · **Scope:** web app (`apps/web`), Android app (`apps/android`), backend code in the repository.

> **How to read this report.** Every result below is labelled with how it was obtained:
> **[RUN]** executed in this audit · **[CI]** executed by GitHub Actions · **[STATIC]** code reading only · **[NOT TESTED]** could not be executed here.
> Nothing is reported as passing unless it was run.

---

## A. Executive Summary

**Overall condition.** The shipping product is one Next.js application on Cloudflare Pages plus a thin Android WebView wrapper around it. That web app is in reasonable shape: it builds cleanly, all 25 screens load without client errors on phone and desktop in both languages, and the player now behaves correctly in the scenarios that could be simulated. It is **not yet a commercial release**: several issues that matter most could only be found by reading code, and a few cannot be fixed without decisions or credentials from the owner.

**Verdict: Conditionally Ready** for a limited beta; **Not Ready** for paid general availability until the P0 items in section L are closed.

**Most important findings**

| # | Finding | Status |
|---|---|---|
| 1 | **Paying customers were never marked as subscribed.** The Stripe webhook updated only Stripe's own metadata; nothing wrote the entitlement to the user record, so a customer who paid would still be locked out when the 7-day trial ended. | **Fixed in this audit** — unit-tested; **not verified against live Stripe** |
| 2 | **Every Android build is signed with a new throw-away debug key.** Each new APK has a different signature, so it cannot be installed over the previous one (the user must uninstall, losing sign-in), and it is a debuggable build. | **Open** — needs a release keystore from the owner |
| 3 | **Next.js 15.4.11 has known advisories (1 critical, 4 high per `npm audit`)** and cannot be patched: the Cloudflare adapter in use (`@cloudflare/next-on-pages`) only accepts Next ≤ 15.5.2. An upgrade to 15.5.29 was attempted and reverted because it breaks the install. | **Open** — needs an adapter migration |
| 4 | **The stream / playlist / EPG proxies are open to anyone.** They check only the `Referer` header, which any script can set. No sign-in, no rate limit. The trial is enforced only in the browser. | **Open** — business decision needed |
| 5 | **"Direct streaming" broke every channel** for http-only providers (browser mixed-content block). | **Fixed and tested** |
| 6 | **The repository describes a platform that is not what ships.** 19 Go microservices, Kafka, Flutter TV/mobile apps are scaffolding; the web app does not call any of them. | **Open** — documentation / scope decision |

**What was actually done in this engagement:** 3 rounds of fixes (24 defects fixed, listed in section J), a permanent automated regression suite added to the repository (26 tests, all passing), performance and accessibility measurements, a dependency audit, and a code-level security review of all 36 API routes.

**What could not be done here — stated plainly**

- **No Android device or emulator** was available (no Android SDK, no KVM). The Android app was never launched in this audit. It was reviewed from source and compiled by CI only.
- **No real IPTV stream** was played. The environment blocks outbound access to stream hosts, so all playback tests use a 12-second test pattern.
- **Only Chromium** was available. Firefox, Safari and real iOS were not tested.
- **The live site was unreachable** from the audit environment, and there is no Cloudflare KV, Firebase or Stripe test account: sign-up, login, billing and the admin panel were not exercised end to end.

---

## B. Application Architecture

### What exists [STATIC + RUN]

| Part | Technology | Size | Role in the shipped product |
|---|---|---|---|
| `apps/web` | Next.js 15.4 (App Router), React 19, hls.js, edge runtime | 161 files, ~29k lines | **The product.** UI + 36 API routes |
| `apps/android` | Capacitor 6 WebView shell | 17 files, ~580 lines | Loads the live site; splash, system bars, deep links |
| `apps/lg-webos` | webOS IPK launcher | 13 files | Loads the live `/tv` route |
| `services/*` (19 modules), `libs/go` | Go 1.24 | ~8.4k lines | **Not used by the web app.** No call from `apps/web` reaches them |
| `apps/tv`, `apps/mobile` | Flutter | ~1.1k lines | Scaffolding; not built or shipped |
| `infrastructure/` | Docker, k8s, Terraform, Prometheus | 12 files | For the Go stack; not used by the Cloudflare deployment |

**Real runtime architecture:** browser → Cloudflare Pages (static pages + edge functions) → Cloudflare KV (users, sessions, settings, rate limits) · Firebase Auth (passwords, email verification) · Stripe (billing) · the user's own IPTV provider (via `/api/m3u`, `/api/epg`, `/api/stream`).

**State model:** the playlist, EPG source, favourites, history and preferences live in the browser's `localStorage`, namespaced per account, and are mirrored to KV as one JSON blob per user. The parsed channel list is cached in `sessionStorage` for 30 minutes.

### Weaknesses and technical debt

- **Documentation does not match the product.** The README and landing page describe Go/Rust microservices, Kafka, CRDT sync, network DVR and AI failover. None of that runs. Landing copy also claims Xtream Codes and Stalker portal support; the app accepts an **M3U URL or file only** (an Xtream `get.php` export works because it is M3U; there is no `player_api` or portal client).
- **Very large components.** `tv/live/page.tsx` is 1,241 lines, `PlayerSurface.tsx` 736, the admin dashboard 533; 383 inline `style={{…}}` blocks. Hard to test and to restyle consistently.
- **No automated web tests existed** before this audit. CI does type-check, lint and build the web app, but runs no web tests.
- **The CI pipeline has been red since at least August 2026**, before this audit: the Flutter analyze job and the Docker image builds fail on every push (the Web, Go and proto jobs pass). A permanently red pipeline hides real failures.
- **Two "home" screens** (`/tv` grid for desktop/TV, `/tv/home` for phones) with user-agent redirects between them.
- **Display strings stored as data** (e.g. a source's status line "5 channels · just now" is saved and never refreshed, so "just now" stays forever).
- **Incremental list rendering, not windowing:** the Live list adds rows as you scroll and never removes them (654 → 7,134 DOM nodes after scrolling a 5,000-channel list).

### Recommendations

1. Decide the fate of the Go/Flutter code: move it to a separate repository or an `experimental/` folder, and rewrite the README to describe what ships.
2. Add the new test suite to CI, and fix or remove the Flutter and Docker jobs so the pipeline can go green.
3. Split the live page and player into smaller units as they are next touched.

---

## C. Web QA Results

**Environment:** production build (`next build` + `next start`), Chromium 153 headless, phone profile (Pixel 7, touch) and desktop (1366×768). Network to providers mocked — see `apps/web/e2e/README.md`.

### Screens tested [RUN] — 25 routes × 4 configurations = 100 page loads

Public: `/`, login, signup, forgot-password, check-email, terms, privacy, admin login.
App: home, live, search, guide, catch-up, sports.
Account (as a mocked signed-in trial user): overview, subscription, plans, sources, devices, appearance, help, preferences, security, parental, notifications.

Each load is checked for uncaught exceptions, console errors, content spilling past the screen edge, and (Hebrew) right-to-left direction, using a playlist with deliberately hostile channel names (very long, no spaces, Hebrew, HTML markup).

**Result: 100 / 100 clean after fixes.**

### Features tested [RUN]

| Feature | Result |
|---|---|
| Channel deep link plays (phone, desktop) | Pass |
| Home → tap channel → plays | Pass |
| Rapid channel zapping (keyboard) keeps playing | Pass |
| Dead channel shows the real reason within seconds (phone, desktop) | Pass |
| Direct streaming falls back to proxy (phone, desktop) | Pass |
| Pinch-zoom, pan clamp, double-tap, reset, pinch-to-close | Pass |
| Tab bar hidden under fullscreen player | Pass |
| Inline playlist edit; second playlist becomes active; old channels disappear from search and Continue Watching | Pass |
| Search: category chips + text filter + empty result | Pass |
| First run with no playlist shows a call to action | Pass |
| Account screens gated when signed out | Pass |
| Login / sign-up reject bad input without calling the server | Pass |
| Hebrew landing page rendered server-side | Pass |
| Playlist markup is never injected into the page (XSS) | Pass |
| Cloudflare Pages production build (`next-on-pages`) | Pass |

### Not tested on the web

Real sign-up / login / password reset / Google sign-in (need Firebase + KV) · checkout and billing portal (need Stripe) · admin dashboard beyond its login page · settings sync between devices · EPG and catch-up with real guide data (the guide was only loaded in its "no EPG" state) · Firefox, Safari, iOS · keyboard-only and screen-reader walkthroughs · slow-network and offline behaviour.

### Remaining web issues

- Six account screens (preferences, parental, security, devices, notifications, help) plus the legal pages and admin are **English only**; they are pinned left-to-right so they read correctly in a Hebrew session, but they are not translated. Appearance is partly translated.
- Channels delivered as raw MPEG-TS (`.ts` URLs, common on Xtream panels) **cannot play in any browser**; the error card now says so, but there is no remux path.
- "Bookmark" in the player saves locally only; cloud DVR, VOD, series and profiles are not implemented (parts of the UI describe them as roadmap).

---

## D. Android QA Results

**Devices / emulators used: none.** No Android SDK, emulator or hardware acceleration is available in the audit environment. **The Android app was not launched, installed or interacted with in this audit.** Everything below is source review plus the CI compile.

| Item | Method | Result |
|---|---|---|
| APK compiles with the changes made in this audit | [CI] `android-apk` workflow | Pass (runs 43720946824, 43742778179) |
| Install, launch, login, navigation, playback, rotation, back button, background/foreground, process death, network switching, memory, battery | — | **NOT TESTED** |
| The landscape full-screen fix (cutout + hidden system bars) | [CI] compiles | **Behaviour unverified on a device** |

### Findings from source [STATIC]

| Finding | Severity | Status |
|---|---|---|
| New random debug keystore generated on every CI run → each APK has a different signature; cannot update in place | **Critical for distribution** | Open |
| `assembleDebug` build is shipped (debuggable, unminified); `versionCode` fixed at 1 | High | Open |
| `android:allowBackup="true"` — WebView cookies (session) eligible for device/cloud backup | Medium | **Fixed** (`false`) |
| JavaScript `prompt()` dialog renders without a text field in the WebView (edit-playlist was unusable) | High | **Fixed** (inline form) — reported by the owner from a real device |
| Player did not fill the screen in landscape: status/navigation bars stayed visible and the display-cutout strip was left black | High | **Fix shipped, unverified on device** |
| Cleartext traffic disabled, mixed content blocked, WebView debugging off, Safe Browsing on, single exported activity with verified https deep links | — | Good |
| App is a remote-URL WebView: no offline screen beyond the splash; an outage of the site is an outage of the app | Medium | By design |

### Reported by the owner from a real phone, not reproducible here

- Bottom tab bar appearing mid-screen with blank space below it. A layout overflow that could cause it was fixed, and `minimum-scale=1` was added, but **the root cause is not confirmed**.

---

## E. IPTV Streaming Assessment

**All playback results use a local 12-second H.264/AAC test pattern served through a mocked proxy. No real provider stream was played.**

### Measured [RUN] (local machine, no real network)

| Metric | Phone profile | Desktop |
|---|---|---|
| Time to first frame, cold deep link (3 runs) | 264 – 324 ms | 401 – 443 ms |
| Channel switch (30 switches) | — | median 134 ms · p90 150 ms · max 164 ms |
| JS heap before → after 30 switches | — | 3.9 MB → 5.7 MB |
| `<video>` elements after 30 switches | — | 1 (no leaked players) |

These numbers show the client adds little overhead and does not leak players. They say nothing about real-world startup time, which is dominated by the provider and the proxy hop.

### Player defects found and fixed

1. **Direct streaming** sent http segment URLs straight to the browser, which blocks them as mixed content → every channel failed. Now http segments stay on the proxy, and a channel that still fails in direct mode is retried through the proxy automatically.
2. **Desktop Chrome/Edge had silently moved onto the browser's built-in HLS**, which reports nothing useful on failure. Routed back to hls.js.
3. **A failed manifest never produced an error** on the hls.js path (the retry was a no-op) → a dead channel spun forever. Now one real retry, then an error.
4. **Every failure read "format not supported".** The error card now reports the HTTP status or the unplayable content type.

### Not tested / known gaps

Real buffering and rebuffering behaviour · reconnection after a network drop · audio-track and subtitle switching (no multi-track fixture) · A/V and subtitle sync · long-duration playback memory · DRM · raw MPEG-TS playback (unsupported).

---

## F. UI/UX Assessment

**Strengths.** Consistent dark visual language; clear first-run call to action; good loading and error states in the player; phone layout with a proper bottom tab bar; real right-to-left support.

**Weaknesses found and fixed.** Collapsed 10-pixel preview player on phones · tab bar covering player controls · plan cards cut off on phones · channel names clipped at both edges · a "Fullscreen" button pushed off-screen · a Hebrew session showing English laid out right-to-left across the landing, sign-up, login, reset, account overview, sources, subscription and plans screens (now translated) · no way to see or change which playlist is active · search suggestions unrelated to the user's playlist (now category chips with counts).

**Accessibility [RUN, Lighthouse 12, mobile emulation]**

| Page | Performance | Accessibility | Best practices | LCP | CLS | TBT |
|---|---:|---:|---:|---|---|---|
| Landing `/` | 98 | 98 | 100 | 2.2 s | 0 | 70 ms |
| Login | 99 | 100 | 96 | 2.0 s | 0 | 30 ms |

The two landing failures (heading order, a label that did not match its visible text) were fixed after the run. Other pages were not run through Lighthouse. No manual keyboard or screen-reader pass was done.

**Still needing design work.** The sources screen is dense on phones (status text wraps into a narrow column) · the player's info bar always highlights "Return to live" even when already live · the account area mixes translated and untranslated screens · the admin panel is desktop-only in practice.

---

## G. Backend Assessment

"Backend" for the shipped product means the 36 edge routes in `apps/web/src/app/api`. They were **read, not exercised** (no KV / Firebase / Stripe here), except where noted.

| Area | Assessment |
|---|---|
| Sessions | Random id in KV, 30-day TTL, cookie `HttpOnly; Secure; SameSite=Strict`. Sound. |
| Auth | Firebase is the source of truth; server verifies and mints its own session. Google sign-in verifies issuer, audience and `email_verified`. Sound. |
| Billing | Checkout and portal are session-bound. **Webhook did not record entitlement — fixed.** Webhook de-duplication is an in-memory map (ineffective across edge isolates, harmless because the handlers are idempotent). |
| Data integrity | KV has no transactions; a user record is read-modify-written (webhook, login timestamp, admin actions can race). Low volume, but real. |
| Rate limiting | KV counter, non-atomic, fails open on KV errors. Present on login, sign-up, password flows, admin login; **absent** on Google sign-in and all proxy routes. |
| Error handling | Consistent JSON errors; some responses include configuration hints ("add STRIPE_SECRET_KEY …") that are better kept in logs. |
| Go services | [RUN] all 19 modules **build** and pass `go vet`. Tests exist in only 3 packages and pass. Not deployed, not called. |

---

## H. Security Assessment

Method: code review of all API routes and the Android wrapper, `npm audit`, and unit tests for the SSRF guard. **No penetration test was run against the live site.**

| Finding | Severity | Evidence | Status |
|---|---|---|---|
| Next.js 15.4.11: 1 critical + 4 high advisories reported by `npm audit` (incl. middleware bypass, cache poisoning, image-optimizer RCE). Several concern self-hosted features Cloudflare Pages does not run, but this was not analysed advisory by advisory | **High** | `npm audit --omit=dev` | **Open** — blocked by `@cloudflare/next-on-pages` (peer `next ≤ 15.5.2`) |
| Open proxy: `/api/stream`, `/api/m3u`, `/api/epg`, `/api/stream/probe`, `/api/playlist/digest` gate on `Referer`/`Origin` equal to the host — trivially set by any non-browser client. No session, no rate limit | **High** (abuse, bandwidth, liability) | `isAllowedCaller` in each route | Open |
| Trial / subscription enforced only by a client overlay and on settings writes; streaming is not gated | Medium | `TrialGate.tsx`, `accessGuard.ts` usage | Open |
| Android: per-build debug signing, debuggable build | High | `android-apk.yml` | Open |
| Android: `allowBackup=true` | Medium | manifest | **Fixed** |
| Provider credentials (inside playlist URLs) stored in `localStorage` and as plain JSON in KV; UI claimed encryption "with your account key" | Medium | `api/settings`, sources copy | Copy corrected; storage unchanged |
| CSP allows `'unsafe-inline'` scripts | Low | `next.config.mjs` | Open |
| Rate limiter fails open; none on Google sign-in | Low | `rateLimit.ts` | Open |
| SSRF guard | — | 26 hostile URL spellings refused, 3 legitimate allowed [RUN] | Good |
| XSS via playlist content | — | Channel names rendered as text; verified with markup in names [RUN] | Good |
| IDOR on sessions, privacy export/delete, admin routes | — | Ownership / admin checks present on each [STATIC] | Good |
| CSRF | — | `SameSite=Strict` session cookie [STATIC] | Good |
| Secrets in repository | — | Only the public Firebase web key, by design | Good |

A previous audit exists at `docs/security/audit-2026-05.md`; it was not re-validated line by line.

---

## I. Performance Assessment

**Web [RUN]** — Lighthouse scores in section F. Large-playlist test, 5,000 channels, phone profile:

| Screen | Ready | DOM nodes | After hard scroll | Worst frame |
|---|---:|---:|---:|---:|
| Live | 769 ms | 654 | 7,134 | 17 ms |
| Home | 739 ms | 248 | 248 | 17 ms |
| Search | 700 ms | 457 | 457 | 17 ms |

No dropped frames at 5,000 channels on this machine; the Live list's DOM growth is the one scalability concern (section B). Measured on a development machine, not a low-end phone.

**Android** — not measured (no device).

**Backend** — not measured (no deployment access). Structural bottleneck: every video segment in proxy mode passes through a Cloudflare function, so bandwidth cost and function limits scale with viewing hours.

---

## J. Bug Fixing Summary

| Issue | Platform | Severity | Root cause | Fix | Verification |
|---|---|---|---|---|---|
| Paid subscription never recorded on the account | Backend | Critical | Webhook wrote Stripe metadata only; `subscribedUntil` was never set | Webhook writes entitlement to KV; pure mapping in `billingAccess.ts` | Unit test; **not run against Stripe** |
| Direct streaming breaks all channels | Web/Android | Critical | http segments blocked as mixed content | Keep http segments on proxy; auto-fallback | Browser test ×2 |
| Dead channel spins forever (hls.js) | Web | High | `startLoad()` does not reload a failed manifest | One `loadSource` retry, then error | Browser test |
| All failures say "format not supported" | Web/Android | High | Native `<video>` exposes no cause | Probe the URL and show status / type | Browser test ×2 |
| Desktop Chromium on bare native HLS | Web | High | `canPlayType` now true in Chromium | `preferNativeHls()` | Browser test |
| Pinch only toggled fullscreen | Web/Android | Medium | No zoom implemented | `usePinchZoom` (zoom, pan, double-tap) | Browser test with real touch input |
| Tab bar over fullscreen player | Phone | High | Relied on Fullscreen API being granted | `ns-player-open` class hides it | Browser test |
| Preview player 10 px tall on phones | Phone | Medium | `1fr` row in an auto-height page | 16:9 box | Visual + suite |
| `/tv/catchup` crashes in Hebrew (React #418) | Web | High | Locale read outside the hook → server/client mismatch | Use `useT()` | Suite (Hebrew) |
| Plan cards cut off on phones | Phone | High | Two-column grid at phone width | Stack below 760 px | Suite |
| Channel names clipped both sides | Phone | Medium | `nowrap` defeated the line clamp | Ellipsis | Suite (long names) |
| Live page wider than screen; Fullscreen button off-screen | Phone | High | Bare `1fr` tracks grew to content | `minmax(0,1fr)` | Suite |
| Edit playlist shows no input field | Android | High | WebView `prompt()` dialog | Inline edit form | Browser test |
| New playlist ignored; old channels persist | All | High | Active source = first in list | Active = most recent; badge + "Use this playlist" | Browser test |
| Continue Watching opens wrong channel after playlist change | All | Medium | History keyed by channel number | Filter to current playlist | Browser test |
| Search had no category filter | All | Medium | Hard-coded suggestions | Category chips from playlist | Browser test |
| Hebrew screens showing English laid out RTL | All | High | Screens never translated | 9 screens translated; rest pinned LTR | Suite (Hebrew) |
| Landing CTA wraps to 3 lines | Phone | Low | No `nowrap` | CSS | Visual |
| Player not full-screen in landscape | Android | High | No cutout mode; bars never hidden | `MainActivity` | **CI compile only** |
| Player controls under status bar | Android | Medium | No safe-area padding | `env(safe-area-inset-*)` | Not verifiable here |
| `allowBackup=true` | Android | Medium | Default | `false` | CI compile |
| Misleading "encrypted with your account key" text | All | Medium | Copy did not match implementation | Rewritten | — |
| Landing heading order / label mismatch | Web | Low | Markup | Fixed | Lighthouse before; not re-run |
| Page could zoom out below 1× | Phone | Low | No `minimum-scale` | Added | — |

---

## K. Test Execution Summary

| Test category | Total | Passed | Failed | Blocked | Not tested |
|---|---:|---:|---:|---:|---:|
| Web unit tests (SSRF, billing, M3U, masking) | 5 | 5 | 0 | 0 | 0 |
| Web browser tests (Chromium) | 21 | 21 | 0 | 0 | 0 |
| Web build + type-check + lint | 3 | 3 | 0 | 0 | 0 |
| Cloudflare Pages production build | 1 | 1 | 0 | 0 | 0 |
| Go: build + vet (19 modules) | 38 | 38 | 0 | 0 | 0 |
| Go: unit test packages | 3 | 3 | 0 | 0 | 0 |
| Lighthouse pages | 2 | 2 | 0 | 0 | 23 |
| Dependency audit (web) | 1 | 0 | 1 | 0 | 0 |
| Android APK compile (CI) | 1 | 1 | 0 | 0 | 0 |
| CI workflow `ci` — Web, Go, Proto lint jobs | 3 | 3 | 0 | 0 | 0 |
| CI workflow `ci` — Flutter analyze, Docker image builds (failing before this audit) | 2 | 0 | 2 | 0 | 0 |
| Android functional tests on device/emulator | 0 | 0 | 0 | all | — |
| Firefox / Safari / iOS | 0 | 0 | 0 | all | — |
| Real-stream playback | 0 | 0 | 0 | all | — |
| Auth / billing / admin end-to-end | 0 | 0 | 0 | all | — |
| Flutter apps | 0 | 0 | 0 | all | — |

"Blocked" means the audit environment lacked the device, browser, network access or account needed.

**Final regression after the last code change:** unit 5/5; browser 21/21 on two consecutive full runs.

**Flakiness disclosed:** during the audit two full runs each reported one failure in the "screens load" test on desktop. The cause was the test itself: its overflow check intermittently flagged a video tile parked off-screen inside a desktop carousel, which is intended behaviour. The check was refined to ignore carousels (this also makes it less strict inside channel rails), after which the two consecutive clean runs above were recorded. One of the two failures was not captured in enough detail to confirm it had the same cause.

Reproduce: `apps/web/e2e/README.md`.

---

## L. Recommendations

### P0 — Critical (before charging customers)

| Recommendation | Type | Business value | Complexity | Effort |
|---|---|---|---|---|
| **Verify the Stripe fix end to end** in Stripe test mode: pay → account shows subscribed → cancel → access ends. Confirm the webhook is subscribed to `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` | Defect verification | Paying users keep access | Low | 0.5 day |
| **Sign the Android app with one permanent release key** (stored as a CI secret), build `release`, increment `versionCode` per build | Defect | Users can update; store-ready | Low | 1 day |
| **Migrate off `@cloudflare/next-on-pages`** (deprecated) to the OpenNext Cloudflare adapter, then upgrade Next.js to a patched release | Security | Closes known advisories; unblocks future patches | Medium | 3–5 days |
| **Test on real Android phones** (at least one notch device, one older Android): the landscape fix, the tab-bar report, rotation, back button | Verification | Confirms fixes that could not be tested | Low | 1 day |
| **Play real provider streams** on phone and desktop, in proxy and direct mode | Verification | The core function is unproven here | Low | 0.5 day |

### P1 — High

| Recommendation | Type | Business value | Complexity | Effort |
|---|---|---|---|---|
| Require a valid session on the proxy routes and add per-account rate limits; decide whether anonymous use is allowed at all | Security / business | Stops free-riding and abuse; enforces the trial | Medium | 2–3 days |
| Run the new test suite in CI; fix or drop the failing Flutter and Docker jobs | Tech debt | Regressions caught before deploy; a pipeline that means something | Low | 1 day |
| Translate the remaining account screens and legal pages into Hebrew | Enhancement | Complete Hebrew product | Low | 2 days |
| Support raw MPEG-TS channels (mpegts.js in the browser, or remux at the proxy) | Missing functionality | Many Xtream channels are `.ts` | Medium | 3–5 days |
| Make marketing copy match the product (no Stalker / Xtream API / DVR claims until they exist) | Defect (accuracy) | Legal and trust | Low | 0.5 day |
| Real Xtream Codes login (server, username, password) with categories, VOD and series | Missing functionality | The dominant IPTV workflow | High | 2–3 weeks |

### P2 — Medium

| Recommendation | Type | Complexity | Effort |
|---|---|---|---|
| True list windowing on the Live screen | Performance | Medium | 2 days |
| Encrypt playlist URLs at rest in KV with a per-user key | Security | Medium | 2 days |
| Remove or relocate the unused Go / Flutter code; rewrite README | Tech debt | Low | 1 day |
| Split the live page and player into smaller components; move inline styles to CSS | Tech debt | Medium | 1 week |
| Audio-track / subtitle / aspect-ratio controls in the player UI | Enhancement | Medium | 3 days |
| Offline / "site unreachable" screen in the Android app | Enhancement | Low | 1 day |
| Tighten CSP (nonce instead of `unsafe-inline`); rate-limit Google sign-in | Security | Medium | 2 days |
| Store source status as data (count, timestamp) and render "x minutes ago" | Defect (minor) | Low | 0.5 day |

### P3 — Nice to have

Favourites and history synced across devices · EPG reminders · Chromecast sender polish · Android TV build with D-pad focus (the web app already has a focus engine) · Picture-in-picture on Android · per-profile parental controls · Firefox/Safari added to the automated suite.

**Remove / redesign:** the "Direct streaming" switch is now safe but still confusing — consider making it automatic. "Bookmark" should be removed or renamed until recording exists.

---

## M. Production Readiness Assessment

| Area | Verdict | Why |
|---|---|---|
| **Web application** | **Conditionally Ready** | Clean build, all screens and simulated playback pass, good Lighthouse scores. Conditions: real-stream test, auth/billing end-to-end test, non-Chromium browsers. |
| **Android application** | **Not Ready** | Never run in this audit; signing makes updates impossible; shipped as a debug build. |
| **Backend** | **Conditionally Ready** | Auth and session design are sound; the billing defect is fixed but unverified; no load or integration testing was possible. |
| **Security** | **Not Ready** | Unpatched framework advisories that cannot be patched on the current adapter, and unauthenticated proxy endpoints. |
| **Overall product** | **Conditionally Ready for a closed beta · Not Ready for paid general availability** | The P0 list is short and mostly verification and configuration, but each item is a release blocker. |

---

## Appendix — Changes made during this engagement

Commits on `claude/nextgen-iptv-platform-rEZiD`: `206b204`, `92f6215`, `0b03cba`, `ca75962` (adds this report), plus two clean-up commits that remove Go build binaries which `ca75962` committed by mistake.

New in the repository: `apps/web/e2e/` (regression suite, fixtures, `perf.mjs`), `apps/web/src/lib/usePinchZoom.ts`, `apps/web/src/lib/billingAccess.ts`, this report.

**Continuation point:** start with section L, P0, in order. Everything marked NOT TESTED in sections C, D and E is the remaining test plan.
