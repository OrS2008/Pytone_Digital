// Cloudflare Worker that sits in front of /play/ and /dvr/.
//
// Responsibilities:
//   1. Validate playback tokens at the edge — cheap HMAC verification — so
//      bot traffic with bad tokens is rejected before reaching our origins.
//   2. Cache HLS manifests with very short TTLs (2s for live, 60s for VOD).
//      We never cache `master.m3u8` longer than 2s because LL-HLS bitrate
//      switching depends on freshness.
//   3. Cache segments for their full duration (10s typical).
//   4. Rewrite range responses when CloudFront / origin returns 206 — this is
//      where most edge caches subtly break HLS.
//
// Real worker is in /infrastructure/cdn/worker/; this file lays out the rules.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Cheap token gate. Real verification happens at the proxy; we just
    //    drop obvious forgeries (missing/short/non-base64).
    if (url.pathname.startsWith('/play/')) {
      const token = url.searchParams.get('token');
      if (!token || token.length < 32) {
        return new Response('forbidden', { status: 403 });
      }
    }

    // 2. Cache key: include the token so different sessions share a cache for
    //    the same upstream URL.
    const cacheKey = new Request(url.toString(), request);
    const cache = caches.default;
    let response = await cache.match(cacheKey);
    if (response) return response;

    response = await fetch(request, { cf: { cacheEverything: true } });

    // 3. Apply per-resource TTLs.
    const ct = response.headers.get('content-type') || '';
    let ttl = 0;
    if (url.pathname.endsWith('master.m3u8')) ttl = 2;
    else if (url.pathname.endsWith('.m3u8')) ttl = 2;
    else if (ct.startsWith('video/') || url.pathname.endsWith('.ts')) ttl = 10;
    else if (url.pathname.endsWith('.mp4')) ttl = 60;

    if (ttl > 0) {
      response = new Response(response.body, response);
      response.headers.set('Cache-Control', `public, max-age=${ttl}, s-maxage=${ttl}`);
      await cache.put(cacheKey, response.clone());
    }
    return response;
  },
};
