# Nova Stream — Android shell

Native Android wrapper built with [Capacitor](https://capacitorjs.com/).
The WebView loads `https://nova-stream-cce.pages.dev/tv` on launch, so
the APK is just a thin native skin around the live deploy — no second
build/deploy pipeline for content, and bug fixes ship the moment the
web build does.

## What this gives you over a PWA / TWA

- No browser chrome at all (TWAs flash a URL bar briefly; this doesn't).
- Native splash screen (`#0F1116` background, teal play mark, fade-out).
- Dark status & navigation bars matching the brand background.
- Immersive fullscreen flag set in `MainActivity` for video playback.
- Keep-screen-on while the app is foregrounded.
- HTTPS-only WebView, `mediaPlaybackRequiresUserGesture=false` so
  autoplay HLS works once the user has navigated.
- Deep links: tapping a `https://nova-stream-cce.pages.dev/tv/*` link
  opens in-app instead of in the browser.

## Building the APK

Don't try to build locally — Android SDK downloads are blocked from
the dev sandbox. Use the GitHub Actions workflow:

1. Push (or merge) any change under `apps/android/**`, OR
2. Open the **Actions** tab → **android-apk** → **Run workflow**.

The workflow:
1. Sets up JDK 17, Node 20, Android SDK 34.
2. Runs `npm install` here, then `npx cap add android` to scaffold the
   native project from `capacitor.config.ts`.
3. Generates launcher icons + splash bitmap from `resources/*.svg`.
4. Copies `android-overrides/` on top of the scaffolded project.
5. Patches `build.gradle` with our `applicationId` / `versionCode` /
   `minSdkVersion`.
6. Generates a throwaway debug keystore and builds a signed debug APK.
7. Uploads it as the `nova-stream-apk` workflow artifact.

Download the artifact, transfer the `.apk` to your phone, allow
"Install unknown apps" for your file manager, and tap to install.

## Going to Play Store

Swap the throwaway keystore for a real one stored in GitHub Secrets:

1. Generate a release keystore locally (`keytool -genkey ...`).
2. `base64 -w0 release.keystore > release.keystore.b64`.
3. Add as repo secret `ANDROID_KEYSTORE_B64`, plus
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
   `ANDROID_KEY_PASSWORD`.
4. Switch the workflow's keystore step to decode the secret and run
   `./gradlew assembleRelease` with `signingConfigs.release`.

## Files

| Path                                            | What it is                                   |
| ----------------------------------------------- | -------------------------------------------- |
| `capacitor.config.ts`                           | App ID, name, splash + status-bar plugin cfg |
| `package.json`                                  | Capacitor deps for the CI install step       |
| `resources/icon.svg` + `splash.svg`             | Brand artwork — rasterised at build time     |
| `resources/generate-android-assets.mjs`         | SVG → PNG mipmap + splash via `sharp`        |
| `android-overrides/app/src/main/AndroidManifest.xml` | Permissions, deep links, immersive Activity |
| `android-overrides/app/src/main/java/.../MainActivity.java` | Edge-to-edge + immersive sticky + WebView tuning |
| `android-overrides/app/src/main/res/values/styles.xml` | NoActionBar dark theme + launch theme   |
| `android-overrides/app/src/main/res/values/colors.xml` | Brand colours                            |
| `www/index.html`                                | Placeholder webDir — Capacitor requires one  |
| `.github/workflows/android-apk.yml`             | The CI build (lives at repo root)            |

The scaffolded `android/` directory is `.gitignored` — it's
regenerated on every CI run from `capacitor.config.ts` +
`android-overrides/`. This keeps the repo small and avoids merge
conflicts in generated code.
