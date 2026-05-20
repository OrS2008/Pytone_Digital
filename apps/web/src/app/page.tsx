// Pytone Web — Next.js 15, app router, server components.
//
// The web client is the most heterogeneous of our three frontends: it has to
// support browsers from a 5-year-old Smart TV to the latest Chromebook. We
// therefore:
//   * SSR the catalog (huge SEO + first-paint win)
//   * Stream UI shell first, then suspend on data-heavy rows
//   * Pick a player at runtime: native HTMLMediaElement when the platform
//     supports HLS natively (Safari, iOS, some smart TVs); hls.js for
//     evergreen browsers; shaka-player for DASH + DRM (Widevine).
import HeroBanner from '@/components/HeroBanner';
import HomeRow from '@/components/HomeRow';

export const dynamic = 'force-dynamic';

const ROWS = [
  'Continue Watching',
  'Live Now',
  'Sports',
  'Trending',
  'Recommended for You',
  'Recently Added',
  'Replay Highlights',
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#06070A] text-white">
      <HeroBanner />
      <div className="space-y-10 pb-24">
        {ROWS.map((title) => (
          <HomeRow key={title} title={title} />
        ))}
      </div>
    </main>
  );
}
