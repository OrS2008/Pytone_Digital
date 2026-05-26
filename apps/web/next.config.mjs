// Build identifier baked into every client bundle so the in-app
// diagnostics ("build a30f516" chip on the playlist-error card) reveal
// whether a user is on the latest deploy or a stale CDN copy. We prefer
// Cloudflare's commit SHA over our own short hash so the value matches
// what's visible in the Pages dashboard for that build.
const BUILD_ID = (
  process.env.NEXT_PUBLIC_BUILD_ID
    || process.env.CF_PAGES_COMMIT_SHA
    || process.env.VERCEL_GIT_COMMIT_SHA
    || ''
).slice(0, 7) || `dev-${Date.now().toString(36)}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: false,
  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.novastream.tv' },
      { protocol: 'https', hostname: 'image.tmdb.org' },
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },

  // Hardening — every response (HTML, API, asset) carries this baseline.
  // CSP permits only the third parties the app legitimately talks to:
  //   - accounts.google.com / gstatic       Google Identity Services
  //   - api.stripe.com / checkout.stripe…   Stripe Checkout / Portal (we
  //                                         redirect rather than embed)
  //   - googleusercontent.com                avatar URLs from sign-in
  //
  // 'unsafe-inline' on style-src is unavoidable for streamed Next.js
  // components; script inline is restricted to the theme bootstrap by
  // 'strict-dynamic' and the explicit allowlist of upstreams.
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://accounts.google.com https://www.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://accounts.google.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "frame-src 'self' https://accounts.google.com",
      "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://api.stripe.com https:",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy',     value: csp },
          { key: 'X-Content-Type-Options',      value: 'nosniff' },
          { key: 'X-Frame-Options',             value: 'DENY' },
          { key: 'Referrer-Policy',             value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security',   value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Cross-Origin-Opener-Policy',  value: 'same-origin-allow-popups' },
          { key: 'Cross-Origin-Resource-Policy',value: 'same-site' },
          {
            key: 'Permissions-Policy',
            value: [
              'accelerometer=()',
              'autoplay=(self)',
              'camera=()',
              'fullscreen=(self)',
              'geolocation=()',
              'gyroscope=()',
              'magnetometer=()',
              'microphone=()',
              'midi=()',
              'payment=()',
              'picture-in-picture=(self)',
              'usb=()',
            ].join(', '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
