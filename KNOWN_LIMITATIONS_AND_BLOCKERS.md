# Known Limitations and Blockers

**Date:** 16 November 2026 · **Branch:** `claude/nextgen-iptv-platform-rEZiD` (local commits, not yet pushed — see "Deployment is waiting on the owner")

Status labels used across all reports: **PASS** implemented and verified · **PARTIAL** implemented, not fully verified · **BLOCKED** needs external access · **FAIL** tested and failed · **NOT TESTED** · **NOT DONE** not implemented in this round.

---

## 1. Blockers that need the owner

| # | What is blocked | Why | What to provide, and how | Test that stays blocked |
|---|---|---|---|---|
| B1 | **Deploying this work** | Pushing this branch auto-deploys production on Cloudflare. The changes require sign-in to watch and a new secret. | Approve the push, after setting B2. | Live-site smoke test |
| B2 | **Encryption at rest** (provider credentials, settings blob) | Needs a server key. Never hard-coded. | Cloudflare Pages → Settings → Variables and Secrets → add **Secret** `NOVA_ENCRYPTION_KEY` = 32 random bytes, base64 (`openssl rand -base64 32`), for **Production and Preview**. Keep a copy in a password manager: losing it makes stored provider connections unreadable. | Provider connections in production; encrypted settings in production |
| B3 | **Real IPTV provider testing** | No Xtream / Stalker account available; the sandbox also blocks outbound stream hosts. | Provide test credentials for an Xtream panel and a Stalker portal **you are authorised to use**, through a secure channel (not chat). | Real login, catalogues, live/VOD/series playback, catch-up, EPG |
| B4 | **Stripe end-to-end** | No Stripe test-mode keys here. | In Stripe **test mode**: set `STRIPE_SECRET_KEY` (sk_test_…), the four `STRIPE_PRICE_*` ids and `STRIPE_WEBHOOK_SECRET` on a Preview deployment; webhook endpoint `/api/billing/webhook` subscribed to `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. | Real checkout → webhook → access granted → cancel → access revoked |
| B5 | **Firebase sign-up / login** | No Firebase project access here. | Use a Preview deployment with the existing Firebase config and a test account. | Sign-up, verification email, login, password reset |
| B6 | **Android release signing** | The owner's keystore cannot be created or replaced by anyone else. | GitHub → Settings → Secrets → Actions: `ANDROID_KEYSTORE_B64` (`base64 -w0 your.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. | Signed release APK; install-over-update |
| B7 | **Android on real devices** | No device, emulator or KVM in this environment. | Install the APK on at least one notch phone and one older Android, and an Android TV if TV is in scope. | Install, playback, fullscreen/cutout, rotation, back, background/foreground, network change |
| B8 | **LG webOS** | No TV or webOS simulator. | Test on a TV with the IPK. | Launcher, remote, playback |
| B9 | **Cross-browser** | Only Chromium is installed here. | Run `apps/web/e2e` with Firefox/WebKit, or test manually in Safari/iOS. | Firefox, Safari, iOS Safari |

## 2. Behaviour change the owner must accept before deploying

- **Watching now requires a signed-in account with an active trial or subscription.** The proxies used to serve anyone (they only checked a forgeable header). Anonymous visitors now see a "Sign in to watch" prompt in the player. This matches the product's "7-day free trial with an account" model but is a visible change.
- **Streaming fails closed if Cloudflare's DNS-over-HTTPS check is unavailable** (SSRF/DNS-rebinding protection). This trades a small availability risk for safety.

## 3. Product limitations (implemented scope vs. requested scope)

| Area | Status | Detail |
|---|---|---|
| Stalker portal EPG | NOT DONE | The portal's own EPG API is not implemented; capabilities report `epg: false`. |
| Stalker catch-up | NOT DONE | The portal archive API is not implemented; capability `catchup: false`, play route returns "unsupported". |
| Stalker portal variants | PARTIAL | Middleware differs between vendors (endpoint, series layout, account fields). Implemented against the common Stalker/Ministra protocol; untested against a real portal. |
| Raw MPEG-TS live streams | PARTIAL | Played via mpegts.js (client-side remux to fragmented MP4 through Media Source Extensions) for `.ts` URLs, incl. TS-only Xtream panels. Verified in Chromium (phone + desktop profiles) with a test file. **Not available where MSE is missing (iPhone Safari)** — the player says so. Server-side remuxing was rejected: Cloudflare functions have per-request CPU limits. Long-running live TS through the proxy is untested against a real provider. |
| MKV and uncommon VOD containers | PARTIAL | Played by the browser's own decoder; MKV with H.265/AC-3 will not play in most browsers. The watch page says so. |
| M3U playlists | PARTIAL (security) | M3U URLs still live in the browser (the client fetches and parses them, as before). They are encrypted at rest in KV once B2 is set, but not hidden from the device. Moving M3U server-side would cost Cloudflare CPU on large playlists. |
| Large channel lists | PARTIAL | Incremental rendering + `content-visibility`. Measured at 20 000 channels (extreme fling): phone p95 67 ms frame, desktop p95 33 ms. Not true windowing (rows are never unmounted). |
| Multiple providers | PARTIAL | Up to 10 connections per account, stored and switchable (the most recently added, or the one picked with "Use this playlist", is active). One source is active at a time; there is no merged catalogue across providers. |
| Unified search across VOD | NOT DONE | Search covers live channels; Movies/Series have their own search. |
| Favourites for movies/series | NOT DONE | Favourites exist for live channels only. |
| Custom channel groups, search history, EPG reminders, parental profiles with per-profile PIN | NOT DONE | Existing parental-control screen unchanged. |
| Hebrew coverage | PARTIAL | All new screens are translated. Six older account screens, legal pages and admin remain English (pinned left-to-right). |
| Admin dashboard upgrade, usage metrics, security event log UI | NOT DONE | Admin API remains server-guarded as before. |
| Observability (structured logs, correlation IDs, dashboards) | NOT DONE | Security-relevant events are logged without secrets; no correlation IDs or error tracking service. |
| OpenNext migration | NOT DONE | Next.js was upgraded to a patched release on the existing adapter (verified working). OpenNext moves the deployment from Pages to Workers and needs owner action. |
| Android TV / D-pad | NOT TESTED | The web app has a remote/focus engine; not verified on a device. |

## 4. Known test-environment limitations

- Browser tests mock `/api/m3u`, `/api/stream` and `/api/providers/*` at the network edge, and play a 12-second test pattern. They prove client behaviour, not provider compatibility.
- Playwright does not re-route a request that follows a fulfilled redirect, so the UI tests serve the play route's end result directly; the real `302 → /api/stream?t=…` chain is covered by the API integration tests.
- Integration tests run the real route handlers in Node with an in-memory KV. The Cloudflare runtime itself was exercised once, manually, with `wrangler pages dev` (pages, auth, gating, SSRF) — not on every run.
