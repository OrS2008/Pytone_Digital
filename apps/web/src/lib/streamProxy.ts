// Wrap an upstream IPTV stream URL so it goes through /api/stream
// instead of being fetched directly from the browser. Without this,
// hls.js / native <video> requests hit the provider directly and get
// CORS-blocked on almost every IPTV provider.
//
// The proxy itself handles HLS manifest rewriting, so once the first
// hop goes through it, the segment fetches that hls.js makes off the
// manifest also stay proxied — no further work needed at the call
// site.

export function proxiedStreamUrl(upstream: string): string {
  if (!upstream) return upstream;
  // Already proxied — don't double-wrap on re-renders.
  if (upstream.startsWith('/api/stream?')) return upstream;
  // Only wrap http(s) — file:// and data: URLs (the upload-source
  // path) are local and don't need the proxy.
  if (!/^https?:\/\//i.test(upstream)) return upstream;
  return `/api/stream?url=${encodeURIComponent(upstream)}`;
}
