import type { Metadata, Viewport } from 'next';
import './globals.css';
import './tv/themes.css';

export const metadata: Metadata = {
  title: 'Nova Stream',
  description: 'The next generation of streaming.',
};

// Without an explicit viewport, mobile browsers render the page at
// 980 px and shrink it to fit — defeating every responsive breakpoint
// the codebase relies on. width=device-width + initial-scale=1 makes
// CSS see the real device width.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0F1116',
};

// Read the saved theme + locale before paint so the page never flashes
// the default palette or LTR direction and then re-renders with the
// user's choice. Runs before React hydration. Mirrors the bootstrap
// that also lives in TvBoot for client-side updates.
//
// Additionally: Cloudflare Pages gives every deploy its own subdomain
// like "10638bbf.nova-stream-cce.pages.dev". Each of those is a
// separate browser origin, so localStorage (playlist, theme, EPG URL,
// account session) does NOT survive a deploy when the user lands on
// the deploy-hash URL instead of the stable production alias. We
// detect that pattern here and bounce them to the stable origin
// before any data is read or written, preserving the path + query.
// Branch preview URLs (claude-foo.nova-stream-cce.pages.dev) are not
// matched — those are intentional development targets.
const THEME_BOOT = `
(function(){try{
  var host = location.hostname;
  // Match an 8-hex-character prefix followed by ".pages.dev" anywhere
  // in the host. That's the Cloudflare Pages deploy-hash format.
  var m = /^([0-9a-f]{8})\\.([^.]+\\.pages\\.dev)$/i.exec(host);
  if (m) {
    location.replace(location.protocol + '//' + m[2] + location.pathname + location.search + location.hash);
    return;
  }
  var t=localStorage.getItem('ns.theme');
  if(t && ['apex','aurora','mono','cyber','premium'].indexOf(t)>=0){
    document.documentElement.setAttribute('data-theme',t);
    document.body && document.body.setAttribute('data-theme',t);
  }
  var l=localStorage.getItem('ns.locale');
  if(!l){
    // First visit — auto-detect Hebrew so Israeli users land in the right direction.
    var nav=(navigator.language||'en');
    l = /^he/i.test(nav) ? 'he' : 'en';
  }
  if(l==='he'||l==='en'){
    document.documentElement.setAttribute('lang',l);
    document.documentElement.setAttribute('dir', l==='he' ? 'rtl' : 'ltr');
  }
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="apex">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
