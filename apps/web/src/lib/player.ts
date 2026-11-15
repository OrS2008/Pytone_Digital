// Nova Stream Web player chooser.
//
// Browsers fall into three buckets:
//
//   1. Safari + iOS  → native HTMLMediaElement plays HLS directly. Best path.
//   2. Chromium / FF / Edge → no native HLS; we use hls.js (LL-HLS support).
//   3. Anything needing DRM (Widevine / PlayReady) → shaka-player (DASH).
//
// This file exposes one function — attachPlayer — that figures out which
// adapter to use for a given (URL, drm?) pair.

export type AttachOpts = {
  url: string;
  drm?: { widevineLicenseUrl?: string; playreadyLicenseUrl?: string };
  maxBitrateKbps?: number;
};

// Should this browser play HLS through the <video> element itself
// rather than through hls.js?
//
// "Does canPlayType say yes" used to be the whole test, on the
// assumption that only Safari answers yes. Desktop Chromium now
// advertises built-in HLS too, which silently moved every desktop
// Chrome / Edge user off hls.js. That path gives us nothing to work
// with when a stream fails: no HTTP status, no retry, no codec detail —
// just MEDIA_ERR_SRC_NOT_SUPPORTED, shown as "format not supported"
// for every kind of failure. hls.js is also more tolerant of the
// sloppy manifests and mislabelled segments IPTV panels serve.
//
// So desktop Chromium goes back to hls.js whenever MSE is available.
// Safari / iOS, Android (WebView + Chrome) and TV runtimes keep the
// native path they have always used.
export function preferNativeHls(video: HTMLVideoElement): boolean {
  if (video.canPlayType('application/vnd.apple.mpegurl') === '') return false;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const chromiumDesktop =
    /Chrome\/|Chromium\/|Edg\//.test(ua) &&
    !/Android|webOS|Web0S|Tizen|SmartTV|HbbTV|CrKey|iPhone|iPad|iPod/i.test(ua);
  const w = typeof window !== 'undefined'
    ? (window as unknown as { MediaSource?: unknown; ManagedMediaSource?: unknown })
    : {};
  const hasMse = !!(w.MediaSource || w.ManagedMediaSource);
  return !(chromiumDesktop && hasMse);
}

export async function attachPlayer(video: HTMLVideoElement, opts: AttachOpts) {
  if (opts.drm) {
    return attachShaka(video, opts);
  }
  if (preferNativeHls(video)) {
    video.src = opts.url;
    await video.play();
    return { dispose: () => video.removeAttribute('src') };
  }
  return attachHls(video, opts);
}

async function attachHls(video: HTMLVideoElement, opts: AttachOpts) {
  const Hls = (await import('hls.js')).default;
  if (!Hls.isSupported()) {
    throw new Error('HLS not supported in this browser');
  }
  const hls = new Hls({
    maxBufferLength: 30,
    backBufferLength: 30,
    lowLatencyMode: true,
    capLevelToPlayerSize: true,
  });
  if (opts.maxBitrateKbps) {
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      hls.autoLevelCapping = hls.levels.findIndex(
        (l) => l.bitrate / 1000 > (opts.maxBitrateKbps ?? Infinity),
      );
    });
  }
  hls.loadSource(opts.url);
  hls.attachMedia(video);
  return { dispose: () => hls.destroy() };
}

async function attachShaka(video: HTMLVideoElement, opts: AttachOpts) {
  // shaka-player's ESM build wraps everything under a namespace; its types
  // do not expose the namespace members at module level, so we type the
  // imported binding as `any` and reach in.
  const mod = (await import('shaka-player')) as any;
  const shaka = mod.default ?? mod;
  shaka.polyfill.installAll();
  const player = new shaka.Player(video);
  if (opts.drm) {
    const servers: Record<string, string> = {};
    if (opts.drm.widevineLicenseUrl) servers['com.widevine.alpha'] = opts.drm.widevineLicenseUrl;
    if (opts.drm.playreadyLicenseUrl) servers['com.microsoft.playready'] = opts.drm.playreadyLicenseUrl;
    player.configure('drm.servers', servers);
  }
  await player.load(opts.url);
  return { dispose: () => player.destroy() };
}
