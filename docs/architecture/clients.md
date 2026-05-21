# Client topology

The platform supports four classes of client. Each one talks to the same
GraphQL + REST gateway and uses the same playback proxy, but their packaging
and rendering pipelines differ.

## 1. LG webOS — IPK hosted Web App

LG TVs do not run Flutter. They run **webOS** with a Chromium-derived
WebKit and accept apps as **IPK** (Itsy Package) bundles.

We use the **hosted Web App** pattern:

```
┌─────────────────────────────┐
│  IPK installed on the TV    │  ~30 KB
│  ┌───────────────────────┐  │
│  │ appinfo.json          │  │  manifest (id, icons, permissions)
│  │ index.html (launcher) │  │  probe network, redirect
│  │ offline.html          │  │  fallback when CDN unreachable
│  │ webOSTV.js            │  │  LunaService bridge
│  └────────────┬──────────┘  │
└───────────────┼─────────────┘
                │  location.replace
                ▼
   ┌─────────────────────────────┐
   │  HTTP app                   │   served by apps/web at /tv
   │  https://app.pytone.tv/tv   │   cached at the edge
   └─────────────────────────────┘
```

### Why hosted

| | Bundled IPK | **Hosted IPK** |
|---|---|---|
| Ship UI change | Re-submit IPK to LG Content Store (weeks) | Push to CDN (seconds) |
| IPK size | 5–40 MB | ~30 KB |
| Works offline | Yes, but a streaming catalogue isn't useful offline anyway | Splash + automatic retry |
| Code reuse with web | None | 100% — same React tree |
| QA Cert iterations | Each iteration is an IPK | Only metadata / permission changes need a new IPK |

### The launcher flow

1. webOS starts our IPK and loads `index.html`.
2. The launcher reads `PalmSystem.launchParams` for deep-link intents (LG
   voice search may launch us with `{action: 'play', channel: '...'}`).
3. It HEADs `/favicon.ico` on the chosen target with a 1.5 s budget.
4. On success → `location.replace(targetUrl?platform=webos&model=...)`.
5. On failure → `location.replace('offline.html')`, which retries on a 5 s
   loop.
6. Inside the hosted app, the remote's Back button (keyCode 461) bubbles
   into our normalised `'GoBack'` key event, which the focus engine handles
   by either dismissing an overlay or letting webOS close the app.

### Submission

LG Content Store wants:

* IPK ≤ 30 MB (we're well under)
* Privacy + Terms URLs
* Localised app description for each region
* Working back-button traversal (their QA Cert Tool checks this)
* No `cross-origin-isolated` violations (our hosted app does not require
  `SharedArrayBuffer`)

See `apps/lg-webos/README.md` for the submission checklist.

## 2. Flutter — Android TV, Google TV, Apple TV, Fire TV

The remaining TV platforms accept native apps. Flutter's TV embedder ships
on AndroidTV / Google TV / Fire TV (via the Android embedder) and on Apple
TV (via the tvOS embedder). We bundle `media_kit` (libmpv) for unified
HEVC / AV1 / HDR support across all four.

Code lives in `apps/tv/`. The focus engine in `lib/src/focus/focus_engine.dart`
mirrors the web TV focus engine (`apps/web/src/components/tv/TvFocus.tsx`)
so behaviour stays consistent for users who use both surfaces.

## 3. Flutter — iOS / Android phones and tablets

`apps/mobile/`. Same data layer, different layout primitives. Touch first,
no focus engine, OS keyboard for search, native picture-in-picture.

## 4. Next.js — desktop browsers

`apps/web/`. SSR-first, hydrated client. Adaptive playback chooser picks
native HLS / hls.js / shaka-player depending on the browser. Shares the
TV component tree (`/tv`) with the LG IPK; the public `/` route is the
desktop layout.

## What's shared across all clients

* **GraphQL contract** at `gateway`.
* **Playback ticket flow** — every client calls `getPlaybackTicket(content)`
  and never sees an origin URL.
* **QoE telemetry shape** so the AI playback supervisor can score all
  sessions uniformly regardless of which client produced them.
* **CRDT sync** documents (favourites, watch progress) — the LG TV app
  and your phone converge to the same state within seconds.
