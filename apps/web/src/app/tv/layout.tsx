// TV layout.
//
// This route is what the LG webOS IPK loads. It's also reachable from any
// browser at /tv (handy for development without a TV). The layout enforces:
//
//   * a 1920x1080 canvas (TVs report 1920x1080 even on 4K panels — the
//     compositor upscales),
//   * no scrollbar chrome,
//   * the TV-specific font / color system,
//   * an early focus-handler shim so the first remote keypress lands on a
//     real element rather than being eaten by the document.
//
// We deliberately suppress the global site header here: the TV experience
// has its own nav bar.

import type { Metadata } from 'next';
import './themes.css';
import './tv.css';
import TvBoot from '@/components/tv/TvBoot';

export const metadata: Metadata = {
  title: 'Nova Stream',
  description: 'The next generation of streaming.',
};

export default function TvLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="nova-tv-root">
      <TvBoot />
      {children}
    </div>
  );
}
