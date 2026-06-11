import type { CapacitorConfig } from '@capacitor/cli';

// Nova Stream — native Android wrapper.
//
// `server.url` points at the live Cloudflare Pages deploy. The webView
// loads it on launch, so the WebView IS the app — there's no bundled
// HTML to keep in sync, no second deploy pipeline, and bug fixes ship
// the moment the web build lands. The trade-off is offline launch:
// if the user has no network the splash sits there until the WebView
// times out. That's acceptable for a streaming app — you can't watch
// anything offline either way.
//
// The browser chrome is fully gone (this is a WebView, not a TWA), so
// the user sees a real app: native splash, dark status bar, immersive
// fullscreen when video plays. Behaviour & look mirror the polish of
// big EU streaming apps (M6+, Molotov, Pluto).

const config: CapacitorConfig = {
  appId: 'tv.novastream.app',
  appName: 'Nova Stream',
  webDir: 'www',
  server: {
    // Lands directly on the new mobile-optimised home page. Same live
    // deploy as before — the URL just points at /tv/home instead of /.
    url: 'https://nova-stream-cce.pages.dev/tv/home',
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#0F1212',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      launchFadeOutDuration: 400,
      backgroundColor: '#0F1212',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER',
      showSpinner: true,
      androidSpinnerStyle: 'small',
      spinnerColor: '#9DC2B8',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0F1212',
      overlaysWebView: false,
    },
  },
};

export default config;
