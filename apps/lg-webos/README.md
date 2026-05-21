# Pytone — LG webOS app

This is the LG TV target. It is a **webOS Web App** packaged as an **IPK**
that acts as a thin launcher for the hosted HTTP app at
`https://app.pytone.tv/tv`.

## Why hosted, not bundled?

| Aspect | Bundled IPK | **Hosted IPK (this one)** |
| --- | --- | --- |
| Ship a UI change | Resubmit to LG Content Store (weeks) | Push to CDN (seconds) |
| IPK size | 5–40 MB | ~30 KB |
| Cold start | Read app from flash | Read app from CDN (warm-cache, edge) |
| Works offline | Yes | Splash + offline retry; the catalogue itself is meaningless offline |
| Same code path as web | No | Yes — single web client serves browsers and the TV |

Hosted is a clear win for a streaming product whose UI iterates daily and
whose content cannot be consumed without connectivity anyway.

## Layout

```
apps/lg-webos/
├── appinfo.json   webOS manifest (app id, icons, permissions)
├── index.html     ~1 KB launcher that probes connectivity then redirects
├── boot.js        ES5-only launcher script
├── offline.html   fallback when the hosted app is unreachable
├── webOSTV.js     stub locally; replaced with the official 1.2.10 build on install
├── icon.png            80x80   app icon
├── largeIcon.png       130x130 large icon (Smart Home menu)
├── splash.png          1920x1080 splash background (LG shows it during cold start)
└── scripts/
    └── fetch-webostvjs.mjs    pinned fetch of the official webOSTV.js
```

## Build the IPK

You need the webOS TV CLI. Either install it locally via npm
(`npm install`) or use the bundled `@webosose/ares-cli`.

```bash
cd apps/lg-webos
npm install          # installs ares-cli + drops the real webOSTV.js into place
make dist            # produces dist/tv.pytone.app_0.1.0_all.ipk
```

## Sideload to a TV

Sideloading requires **Developer Mode** on the TV (install the
*Developer Mode* app from the LG Content Store, sign in with a webOS
Developer account, toggle Dev Mode on).

```bash
# One-time: register your TV
ares-setup-device --add pytone-tv \
    --info "host=192.168.1.42, port=9922, username=prisoner, passphrase=KEYFROMTV"

# Build, install, launch
make install DEVICE=pytone-tv
make launch  DEVICE=pytone-tv

# Live-debug from your laptop's Chrome:
make inspect DEVICE=pytone-tv
```

## Pointing at a different environment

```bash
# Run the staging hosted app
make launch-staging

# Or set a sticky override on the device
ares-launch -d pytone-tv tv.pytone.app -p '{"target":"staging"}'
```

## Submitting to LG Content Store

1. Bump `version` in `appinfo.json`.
2. `make dist` — produce the IPK.
3. Replace the placeholder icons under `icon.png` / `largeIcon.png` /
   `splash.png` with the production assets (see brand guidelines).
4. Run LG's **QA Cert Tool** locally to catch the common rejections (icon
   sizes, splash dimensions, focus traversal smoke tests).
5. Upload via the [LG Seller Lounge](https://seller.lgappstv.com) along
   with privacy URL, content rating, and the regional availability matrix.

## What the launcher does on cold start

```
PalmSystem available?
        │
        ├─ no   → browser preview, redirect to https://app.pytone.tv/tv
        │
        └─ yes  → parse launchParams for deep links + env overrides
                  ↓
                  HEAD /favicon.ico on the chosen target (1.5 s budget)
                  ├─ ok   → location.replace(target?platform=webos&model=…)
                  └─ fail → location.replace('offline.html')
```

The launcher uses `location.replace`, not `location.assign`, so the
launcher itself never ends up in the back stack — pressing the remote's
Back button from inside the app exits to the webOS launcher, which is what
users expect on an LG TV.
