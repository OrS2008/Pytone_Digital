/*
 * Bundled stub for webOSTV.js so the launcher can boot in a browser preview
 * (where PalmSystem is undefined) without throwing reference errors.
 *
 * In a production build the official `webOSTVjs` package is dropped in here
 * by `npm run prepare` (see package.json) so the real LunaService and
 * PalmSystem bridge is used on-device.
 */
(function () {
  if (typeof window === 'undefined') return;
  if (window.webOS) return;
  window.webOS = {
    platform: { tv: !!window.PalmSystem },
    service: {
      request: function () {
        // No-op in browser preview.
        return { cancel: function () {} };
      }
    },
    libVersion: '0.0.0-stub'
  };
})();
