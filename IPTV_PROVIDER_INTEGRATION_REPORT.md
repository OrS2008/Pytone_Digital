# IPTV Provider Integration Report

**Date:** 16 November 2026 · Status labels: see `KNOWN_LIMITATIONS_AND_BLOCKERS.md`.

> **Verification level.** Every provider client was tested against mock servers that answer in the real protocols' response shapes (`apps/web/e2e/integration/provider-mocks.mjs`). **No real Xtream panel or Stalker portal was available** (blocker B3), so no integration below is PASS against a real provider.

## 1. Architecture

```
Browser ── /api/providers/* ──► viewerAuth (session + access + rate limit)
                                   │
                                   ▼
                       providers/store.ts  (KV, AES-GCM, per user)
                                   │
                                   ▼
            makeClient(type) ─► XtreamClient | StalkerClient   (ProviderClient interface)
                                   │   safeHttp: SSRF checks every hop, 20 s timeout, 40 MB cap
                                   ▼
                           provider's own API
Playback:  /api/providers/:id/play/<kind>/… ─► resolve() ─► sealed token ─► 302 /api/stream?t=…
```

- **Common model** (`lib/providers/types.ts`): `Capabilities`, `AccountInfo`, `Category`, `LiveChannel`, `Movie`/`MovieDetail`, `Series`/`SeriesDetail`/`Episode`, `PlayRef`. The UI and player only see these.
- **Errors** (`ProviderError`): `invalid_config` 400 · `auth_failed` 422 · `account_inactive` 422 · `unreachable` 502 · `bad_response` 502 · `unsupported` 404. Messages are user-facing and contain no credentials.
- **Capabilities are measured, not assumed:** at connection time the server asks the provider for live channels, VOD and series categories and archive flags; the UI hides what is not offered.
- **Multiple providers:** up to 10 per account; one active at a time.

## 2. Xtream Codes — PARTIAL (mock-verified)

| Capability | Endpoint used | Status |
|---|---|---|
| Login, account status, expiry, trial flag, active/max connections, allowed formats | `player_api.php` | PARTIAL |
| Live categories / channels (number, logo, EPG id, archive days) | `get_live_categories`, `get_live_streams` | PARTIAL |
| VOD categories / list / details (plot, genre, duration, cast, backdrop) | `get_vod_categories`, `get_vod_streams`, `get_vod_info` | PARTIAL |
| Series categories / list / seasons / episodes | `get_series_categories`, `get_series`, `get_series_info` | PARTIAL |
| Live playback (HLS preferred; TS if the panel allows only TS) | `/live/u/p/id.m3u8` | PARTIAL |
| Movie / episode playback | `/movie/…`, `/series/…` | PARTIAL |
| Catch-up | `/timeshift/u/p/minutes/YYYY-MM-DD:HH-MM/id.m3u8`, start in the server's timezone | PARTIAL |
| XMLTV guide | `xmltv.php` streamed through `/api/providers/:id/epg` | PARTIAL |
| Input handling | Pasted `get.php`/`player_api.php` links reduced to the base URL; credentials in URL, foreign schemes, oversize values rejected | PASS (unit) |

Known variance not covered: panels that return `exp_date` as a date string, non-standard `rating` fields, and panels requiring a specific User-Agent for `player_api.php`.

## 3. Stalker / Ministra portal (MAG) — PARTIAL (mock-verified)

| Capability | Mechanism | Status |
|---|---|---|
| Endpoint discovery | `/stalker_portal/server/load.php`, `/portal.php`, `/server/load.php` | PARTIAL |
| Session | `handshake` → Bearer token; MAC cookie; MAG User-Agent; `get_profile` | PARTIAL |
| Token expiry | Re-handshake once on rejection | PARTIAL (tested) |
| Account expiry | `account_info.get_main_info` (`end_date`) | PARTIAL |
| Live genres / channels / `create_link` | `itv.*` | PARTIAL |
| VOD categories / paginated list (≤ 25 pages) / `create_link` | `vod.*` | PARTIAL |
| Series (seasons via `movie_id`, episode via `series=<n>`) | `vod.get_ordered_list`, `vod.create_link` | PARTIAL |
| EPG, catch-up | portal APIs | **NOT DONE** — reported as unavailable |

**Authorisation:** the client uses only the MAC the provider registered for the user. It does not generate, scan or rotate MACs, and never bypasses portal access controls.

## 4. M3U / Extended M3U — existing, unchanged path

Remote URL and file upload, `tvg-*`, `group-title`, logos, numbers, `catchup*` attributes, `http-user-agent`/`referrer`, 16 MB cap, parse diagnostics — implemented previously and covered by unit tests. Not moved server-side (see Limitations).

## 5. API reference (new)

| Method & path | Purpose | Auth | Limit |
|---|---|---|---|
| `GET /api/providers` | List connections (no secrets) | session + access | — |
| `POST /api/providers` `{type,name,config}` | Verify and save (encrypted) | session + access | 10 / 10 min |
| `GET /api/providers/:id` | Re-check account | owner | 120 / 5 min |
| `DELETE /api/providers/:id` | Remove connection and secrets | owner | — |
| `GET /api/providers/:id/live` | Channels in the app's channel shape | owner | 120 / 5 min |
| `GET /api/providers/:id/vod[?category]`, `/vod/:vid` | Movies, details | owner | 120 / 5 min |
| `GET /api/providers/:id/series[?category]`, `/series/:sid` | Series, seasons, episodes | owner | 120 / 5 min |
| `GET /api/providers/:id/epg` | XMLTV (streamed, 96 MB cap) | owner | 120 / 5 min |
| `GET /api/providers/:id/play/<kind>/…[?json=1]` | Resolve → 302 to sealed stream (or JSON `{url,hls}`) | owner | — |

"owner": someone else's provider id answers 404; tokens are bound to the issuing user (tested).

## 6. Data model

KV `providers:<userId>` → one `nsb1.` ciphertext (AES-256-GCM, AAD `providers:<userId>`) of `ProviderRecord[]` (`id, type, name, createdAt, config, capabilities, account, checkedAt`). Browser source list stores only `provider:<id>`.

## 7. Tests executed

`apps/web/e2e/integration/providers.test.mjs` — 12/12 passing (config validation, normalisation, error classes, URL construction incl. timezone, Stalker session and token refresh, encrypted storage, no secrets in responses, play → sealed stream → real URL, IDOR, malformed/oversized input). `apps/web/e2e/providers.test.mjs` — 7/7 browser tests of the UI against mocked API responses.

## 8. To reach PASS

Run the same flows against an authorised Xtream panel and Stalker portal (blocker B3): connect, browse each catalogue, play live/movie/episode/catch-up, guide, expired token, wrong credentials.
