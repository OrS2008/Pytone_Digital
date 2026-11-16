# Known Limitations and Blockers

**Date:** 16 November 2026 · **Branch:** `claude/nextgen-iptv-platform-rEZiD` — deployed (pushed with owner approval).

Status labels used across all reports: **PASS** implemented and verified · **PARTIAL** implemented, not fully verified · **BLOCKED** needs external access · **FAIL** tested and failed · **NOT TESTED** · **NOT DONE** not implemented in this round.

---

## 1. Blockers that need the owner

| # | What is blocked | Why | What to provide, and how | Test that stays blocked |
|---|---|---|---|---|
| B1 | **Live-site verification** | Deployed by push; the live site is not reachable from this environment. | Owner smoke test: sign in, play, connect Xtream, open Movies. | Live-site smoke test |
| B2 | **Encryption at rest** (provider credentials, settings blob) | Needs a server key. Never hard-coded. **Owner reports it is set** (not observable from here). | Cloudflare Pages → Settings → Variables and Secrets → add **Secret** `NOVA_ENCRYPTION_KEY` = 32 random bytes, base64 (`openssl rand -base64 32`), for **Production and Preview**. Keep a copy in a password manager: losing it makes stored provider connections unreadable. | Provider connections in production; encrypted settings in production |
| B3 | **Real IPTV provider testing** | No Xtream / Stalker account available; the sandbox also blocks outbound stream hosts. | Provide test credentials for an Xtream panel and a Stalker portal **you are authorised to use**, through a secure channel (not chat). | Real login, catalogues, live/VOD/series playback, catch-up, EPG |
| B4 | **Stripe end-to-end** | No Stripe test-mode keys here. | In Stripe **test mode**: set `STRIPE_SECRET_KEY` (sk_test_…), the four `STRIPE_PRICE_*` ids and `STRIPE_WEBHOOK_SECRET` on a Preview deployment; webhook endpoint `/api/billing/webhook` subscribed to `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. | Real checkout → webhook → access granted → cancel → access revoked |
| B5 | **Firebase sign-up / login** | No Firebase project access here. | Use a Preview deployment with the existing Firebase config and a test account. | Sign-up, verification email, login, password reset |
| B6 | ~~Android release signing~~ **RESOLVED 16 Nov 2026** | Release keystore created at the owner's request and handed to the owner; the four secrets are set. Build #16 is a signed release (signer SHA-256 `16:21:1E:25:…:89:B6:4E`, verified by apksigner in CI). Anyone with an earlier debug APK must uninstall once; later updates install over it. | Keep the `.jks` and password backed up. | — |
| B7 | **Android on real devices** | No device, emulator or KVM in this environment. | Install the APK on at least one notch phone and one older Android, and an Android TV if TV is in scope. | Install, playback, fullscreen/cutout, rotation, back, background/foreground, network change |
| B8 | **LG webOS** | No TV or webOS simulator. | Test on a TV with the IPK. | Launcher, remote, playback |
| B9 | **Cross-browser** | Only Chromium is installed here. | Run `apps/web/e2e` with Firefox/WebKit, or test manually in Safari/iOS. | Firefox, Safari, iOS Safari |

## 2. Behaviour change the owner must accept before deploying

- **Watching now requires a signed-in account with an active trial or subscription.** The proxies used to serve anyone (they only checked a forgeable header). Anonymous visitors now see a "Sign in to watch" prompt in the player. This matches the product's "7-day free trial with an account" model but is a visible change.
- **Streaming fails closed if Cloudflare's DNS-over-HTTPS check is unavailable** (SSRF/DNS-rebinding protection). This trades a small availability risk for safety.

## 3. Product limitations (implemented scope vs. requested scope)

| Area | Status | Detail |
|---|---|---|
| Stalker portal EPG | PARTIAL | Built from `itv.get_epg_info` and served as XMLTV; mock-verified only. Portals without that action report `epg: false`. |
| Stalker catch-up | NOT DONE | The portal archive API is not implemented; capability `catchup: false`, play route returns "unsupported". |
| Stalker portal variants | PARTIAL | Middleware differs between vendors (endpoint, series layout, account fields). Implemented against the common Stalker/Ministra protocol; untested against a real portal. |
| Raw MPEG-TS live streams | PARTIAL | Played via mpegts.js (client-side remux to fragmented MP4 through Media Source Extensions) for `.ts` URLs, incl. TS-only Xtream panels. Verified in Chromium (phone + desktop profiles) with a test file. **Not available where MSE is missing (iPhone Safari)** — the player says so. Server-side remuxing was rejected: Cloudflare functions have per-request CPU limits. Long-running live TS through the proxy is untested against a real provider. |
| MKV and uncommon VOD containers | PARTIAL | Played by the browser's own decoder; MKV with H.265/AC-3 will not play in most browsers. The watch page says so. |
| M3U playlists | PARTIAL (security) | M3U URLs still live in the browser (the client fetches and parses them, as before). They are encrypted at rest in KV once B2 is set, but not hidden from the device. Moving M3U server-side would cost Cloudflare CPU on large playlists. |
| Large channel lists | PASS (sim) for realistic use · PARTIAL under extreme flings | Incremental rendering, memoised rows, `content-visibility`. 20 000 channels, fast realistic scroll (3 000 px/s): 60 fps, no janky frames on phone or desktop profiles. Extreme fling (54 000 px/s): phone p95 50 ms, desktop p95 33 ms. Rows are not unmounted once rendered. Measured on a development machine, not a low-end phone. |
| Multiple providers | PARTIAL | Up to 10 connections per account, stored and switchable (the most recently added, or the one picked with "Use this playlist", is active). One source is active at a time; there is no merged catalogue across providers. |
| Unified search across VOD | PASS (sim) | Search shows live channels plus the active provider's movies and series. |
| Favourites for movies/series | PASS (sim) | "My list" for movies and series, synced across devices (`vod.favorites`). |
| Parental controls | PASS (sim) | Block list (name contains / category equals) enforced wherever channels are listed; per-device 4-digit PIN locks the list and gates showing blocked channels (1-hour unlock). A household lock in the browser, not a security boundary. Rating cap and profiles were removed (could not be enforced). |
| EPG reminders | PASS (sim) · PARTIAL in background | Tap a future programme in the guide → reminder (synced `epg.reminders`). Fires a minute before start as an in-app toast with "Watch now"; a system notification is also shown when the tab is in the background and permission was granted. **Only while the app is open** — there is no push service, and the Android WebView does not expose the Notification API. |
| Search history | PASS (sim) | Last 12 searches, synced (`search.history`); reuse, remove one, clear all. |
| Custom channel groups | PASS (sim) | Create / rename / delete groups and pick channels (`/tv/account/groups`, synced `channels.groups`); filter chips above the live list (All · My list · each group). Keyboard up/down stays within the group. |
| Live channel favourites sync | PASS (sim) | Channel "My list" was stored per device only; it now rides the settings sync (`favorites`). |
| Per-profile parental settings | NOT DONE | Profiles were removed (could not be enforced); one household block list + PIN. |
| Hebrew coverage | PARTIAL | All app and account screens (incl. groups, reminders, voice-search messages) are translated (checked by a parity test and a no-English-prose browser test). Legal pages are now English + Hebrew with a language switch; the Hebrew text is a **translation awaiting legal review** and says the English text prevails. The admin panel remains English. |
| Legal text accuracy | PARTIAL | Privacy policy and terms were rewritten to match the code (Firebase holds passwords; encryption at rest; session records keep user agent and sign-in IP; immediate deletion; Cloudflare / Google / Stripe as processors; 7-day trial; monthly and yearly plans; fixed "last updated" date instead of today's date). **Not reviewed by a lawyer.** |
| Admin dashboard | PARTIAL | System tab now shows live health checks (KV round-trip, encryption key, Stripe, Firebase, Google, admin secrets, key rotation); native dialogs replaced. No usage-metrics or security-event views — events go to the structured log instead. |
| Observability | PARTIAL | JSON-line logs with redaction (`lib/log.ts`), `x-request-id` on every API request/response (cf-ray when present), `/api/health` for uptime monitors, admin health checks. Events: gate storage errors and rate limits, provider upstream errors, failed / rate-limited logins (no emails or IPs). No external error-tracking service or dashboards (needs an owner account, e.g. Cloudflare Logpush). |
| OpenNext migration | NOT DONE | Next.js was upgraded to a patched release on the existing adapter (verified working). OpenNext moves the deployment from Pages to Workers and needs owner action. |
| Android TV / D-pad | NOT TESTED | The web app has a remote/focus engine; not verified on a device. |

## 4. Known test-environment limitations

- Browser tests mock `/api/m3u`, `/api/stream` and `/api/providers/*` at the network edge, and play a 12-second test pattern. They prove client behaviour, not provider compatibility.
- Playwright does not re-route a request that follows a fulfilled redirect, so the UI tests serve the play route's end result directly; the real `302 → /api/stream?t=…` chain is covered by the API integration tests.
- Integration tests run the real route handlers in Node with an in-memory KV. The Cloudflare runtime itself was exercised once, manually, with `wrangler pages dev` (pages, auth, gating, SSRF) — not on every run.
