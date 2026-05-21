/*
 * Pytone webOS launcher boot script.
 *
 * Responsibilities, in order:
 *   1. Resolve which URL to load (prod / staging / per-device override).
 *   2. Forward launch params (deep links, voice intents) as query string.
 *   3. Probe reachability with a 1.5 s HEAD; fall back to offline.html if it
 *      fails so the user never stares at a blank screen.
 *   4. Replace the document so the launcher does not pollute history — back
 *      from the app exits to the webOS launcher, as users expect.
 *
 * Compatibility:
 *   This file is intentionally ES5-only. Older webOS versions ship a WebKit
 *   that does not support optional chaining, async/await, or template
 *   literals reliably. Keep it boring.
 */
(function () {
  'use strict';

  var TARGETS = {
    prod:    'https://app.pytone.tv/tv',
    staging: 'https://staging.app.pytone.tv/tv'
  };

  function getOverride() {
    // Per-device override is set via Developer Mode using
    //   ares-launch tv.pytone.app -p '{"target":"staging"}'
    // (or by storing a value in webOS settings storage).
    try {
      if (window.PalmSystem && PalmSystem.launchParams) {
        var lp = JSON.parse(PalmSystem.launchParams);
        if (lp && lp.target && TARGETS[lp.target]) return TARGETS[lp.target];
        if (lp && lp.appUrl) return String(lp.appUrl);
      }
    } catch (e) { /* malformed launch params — ignore */ }
    try {
      var saved = localStorage.getItem('pytone.target');
      if (saved && TARGETS[saved]) return TARGETS[saved];
    } catch (e) { /* localStorage may be locked down */ }
    return TARGETS.prod;
  }

  function getLaunchParamsQuery() {
    try {
      if (!window.PalmSystem || !PalmSystem.launchParams) return '';
      var raw = PalmSystem.launchParams;
      // Strip routing-only fields so we don't leak them to the web app.
      var lp = JSON.parse(raw);
      delete lp.target;
      delete lp.appUrl;
      var keys = Object.keys(lp);
      if (keys.length === 0) return '';
      var pairs = [];
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        pairs.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(lp[k])));
      }
      return '?' + pairs.join('&');
    } catch (e) {
      return '';
    }
  }

  function deviceContext() {
    var ctx = { platform: 'webos' };
    try {
      if (window.PalmSystem && PalmSystem.deviceInfo) {
        var info = JSON.parse(PalmSystem.deviceInfo);
        ctx.model = info.modelName || '';
        ctx.firmware = info.firmwareVersion || '';
        ctx.uhd = info.uhd === true || info.uhd === 'true';
        ctx.hdr = info.hdrType || '';
      }
    } catch (e) { /* ignore */ }
    return ctx;
  }

  function probeThenRedirect(url, query) {
    var fallback = setTimeout(function () {
      window.location.replace('offline.html');
    }, 1500);

    var img = new Image();
    img.onload = img.onerror = function () {
      clearTimeout(fallback);
      // We deliberately use replace() to avoid leaving the launcher in the
      // history stack — pressing Back from inside the app exits to the
      // webOS home, which is the expected behaviour on LG TVs.
      var sep = url.indexOf('?') === -1 ? '?' : '&';
      var ctx = deviceContext();
      var devQs = 'platform=' + ctx.platform +
                  (ctx.model    ? '&model='    + encodeURIComponent(ctx.model)    : '') +
                  (ctx.firmware ? '&fw='       + encodeURIComponent(ctx.firmware) : '') +
                  (ctx.hdr      ? '&hdr='      + encodeURIComponent(ctx.hdr)      : '') +
                  (ctx.uhd      ? '&uhd=1'                                        : '');
      window.location.replace(url + sep + devQs + (query ? '&' + query.slice(1) : ''));
    };
    // Use a cache-busting reachability ping. The favicon is small and almost
    // always served quickly, with no CORS concerns for an Image().
    var ping = url.replace(/\/tv.*$/, '/favicon.ico') + '?t=' + Date.now();
    img.src = ping;
  }

  var target = getOverride();
  var query  = getLaunchParamsQuery();
  probeThenRedirect(target, query);
})();
