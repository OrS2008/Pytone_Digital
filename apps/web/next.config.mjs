/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // typedRoutes disabled for now: many screens (legal, marketing, the
  // password-reset flow) live as routes-to-be — typing them ahead of time
  // would force a Page stub for each. Re-enable when the routing settles.
  typedRoutes: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.novastream.tv' },
      { protocol: 'https', hostname: 'image.tmdb.org' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

export default nextConfig;
