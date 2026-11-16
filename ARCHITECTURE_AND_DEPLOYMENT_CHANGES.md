# Architecture and Deployment Changes

**Date:** 16 November 2026 · Branch `claude/nextgen-iptv-platform-rEZiD` · Deployed by push (owner-approved) to Cloudflare Pages.

## 1. Runtime architecture (after this work)

```
Browser / Android WebView / webOS launcher
   │  https, session cookie (HttpOnly, Secure, SameSite=Strict)
   ▼
Cloudflare Pages (Next.js 15.5.29 via @cloudflare/next-on-pages, edge runtime)
   ├─ pages /tv/*  (live, guide, catch-up, search, movies, series, watch, account)
   ├─ /api/auth/*, /api/billing/*, /api/admin/*, /api/settings, /api/privacy/*
   ├─ content gate  lib/viewerAuth  ── session + active access + per-account limits
   │     ├─ /api/stream  (url= or sealed t=)   ─┐
   │     ├─ /api/m3u, /api/epg, /api/stream/probe, /api/playlist/digest
   │     └─ /api/providers/*  ── lib/providers (Xtream, Stalker) ── store (KV, AES-GCM)
   │                                              │
   │        safeFetch: SSRF checks on every hop ◄─┘
   ▼
Cloudflare KV (NOVA_KV): users, sessions, encrypted settings, encrypted providers,
                         rate-limit counters, Stripe event markers
Firebase Auth · Stripe · the user's IPTV provider(s)
```

The Go services, Flutter apps, Kafka/k8s infrastructure in the repository are **not part of the runtime** (unchanged from the previous audit).

## 2. New modules

| Module | Purpose |
|---|---|
| `lib/secretBox.ts` | AES-256-GCM, key ids, rotation |
| `lib/viewerAuth.ts` | Content gate (401/402/429/503) with 60 s isolate cache |
| `lib/streamToken.ts` | Sealed, user-bound upstream URLs |
| `lib/settingsStore.ts` | Encrypted settings blob |
| `lib/cors.ts` | Origin allow-list for proxies |
| `lib/billingAccess.ts` | Stripe subscription → `subscribedUntil` |
| `lib/providers/*` | Provider model, Xtream and Stalker clients, encrypted store, route helpers |
| `lib/providersClient.ts`, `lib/vodProgress.ts` | Browser API client; synced resume positions |
| `app/api/providers/**` | Provider REST API (see provider report) |
| `app/tv/{movies,series,series/view,watch}` | VOD screens |

## 3. Data model changes (KV)

| Key | Change |
|---|---|
| `settings:<userId>` | Now `nsb1.`-encrypted when the key is set; plaintext still readable (migrates on next save) |
| `providers:<userId>` | **New.** Encrypted array of provider connections |
| `stripe_evt:<eventId>` | **New.** Idempotency marker, 7-day TTL |
| `user:<email>` | `subscribedUntil` is now written by the Stripe webhook |
| `rl:*` | TTL floor 60 s |

No destructive migration. Rolling back the code leaves encrypted blobs unreadable by the old code (old code would treat them as invalid JSON and return `{}`) — see Rollback.

## 4. Configuration

### Cloudflare Pages (Production **and** Preview)
| Name | Type | Required | Notes |
|---|---|---|---|
| `NOVA_ENCRYPTION_KEY` | Secret | **Yes** for provider connections and encrypted settings | `openssl rand -base64 32`. Owner reports it is set. |
| `NOVA_ENCRYPTION_KEY_PREVIOUS` | Secret | Only during rotation | Old key while re-sealing |
| `ALLOWED_HOSTS` | Var | Optional | Extra origins allowed by proxy CORS |
| existing Stripe / Firebase / admin secrets | — | unchanged | |

**Key rotation:** set `_PREVIOUS` = current key, set a new `NOVA_ENCRYPTION_KEY`, redeploy. Blobs re-seal on their next write (provider store re-seals on read). Remove `_PREVIOUS` once all users have been active, or keep it.

### Stripe webhook
Endpoint `/api/billing/webhook`, events `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.

### Android signing (GitHub → Settings → Secrets → Actions)
`ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
Create a keystore once and keep it safe — losing it means users must uninstall to update:
```bash
keytool -genkeypair -v -keystore nova-release.jks -alias nova -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 nova-release.jks   # → ANDROID_KEYSTORE_B64
```
With the secrets, CI builds `assembleRelease`, verifies the signature with `apksigner`, and publishes `nova-stream.apk`. Without them it publishes a debug build with a warning. `versionCode` = workflow run number.

## 5. Dependency changes
- `next` / `eslint-config-next` 15.4.11 → 15.5.29; overrides for `postcss`, `sharp`, `nanoid`, `source-map-js`; override of `@cloudflare/next-on-pages`' peer range for `next`.
- Added `mpegts.js` 1.8.0 (Apache-2.0) for raw MPEG-TS playback.
- CSP: `worker-src 'self' blob:` added.

**Adapter:** `@cloudflare/next-on-pages` is deprecated. It works with Next 15.5.29 (verified with `wrangler pages dev`), but the supported path is **OpenNext for Cloudflare**, which deploys to Workers rather than Pages. Recommended as a planned migration with a staging environment; not done here because it changes the hosting product and needs owner action in the Cloudflare dashboard.

## 6. CI/CD
`ci.yml` web job: Node 22 · `npm ci` · `npm audit --omit=dev` (gate) · type-check · lint · `next build` · `next-on-pages` build · unit · API integration/security · browser tests (Chromium). The Flutter and Docker jobs, red since August 2026, were fixed (Flutter 3.24 API, lowercase GHCR owner, Go 1.24 in the service Dockerfile); the whole pipeline is green. `android-apk.yml`: release/debug split described above. No automatic production deploy was added — deployment remains Cloudflare's branch build, triggered by an owner-approved push.

## 7. Cloudflare limits and cost — trade-offs
| Concern | Design decision |
|---|---|
| Per-request CPU | Heavy parsing stays in the browser (M3U, XMLTV indexing); provider lists are normalised server-side (JSON parse of a few MB) — may exceed the **free** plan's CPU budget on very large panels; paid plan recommended. |
| Proxy bandwidth | Every proxied segment is a function invocation and egress. "Direct streaming" (https CDNs only) and sealed tokens are both supported; tokens force the proxy because the URL must stay secret. |
| KV writes | No KV write per segment; rate limits only on non-segment routes. |
| Long live streams | Streamed responses (TS) are pass-through; not tested against a real provider for hours-long sessions. |

## 8. Rollback
1. Revert to the commit before `57bc0af` and push (or redeploy that build in the Cloudflare dashboard → Deployments → Rollback).
2. **Data note:** settings saved after the key was set are encrypted; the old code cannot read them and would fall back to the copy in each user's browser (which the old client then re-uploads in plaintext). Provider connections exist only in the new code and would be ignored.
3. Keep `NOVA_ENCRYPTION_KEY` configured so a roll-forward can read everything again.
