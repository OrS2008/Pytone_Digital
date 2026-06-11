import type { Metadata, Viewport } from 'next';
import './globals.css';
import './tv/themes.css';

export const metadata: Metadata = {
  title: 'Nova Stream',
  description: 'The next generation of streaming.',
  // Installable-app metadata. Next auto-links the manifest from
  // app/manifest.ts; here we add the iOS home-screen icon + standalone
  // hints so "Add to Home Screen" gives a real app shell on iPhone too.
  applicationName: 'Nova Stream',
  appleWebApp: {
    capable: true,
    title: 'Nova Stream',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
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
  // Theme selection — runs before paint so the page never flashes the
  // wrong palette. Priority: saved choice > phone default (sage) > apex.
  // "sage" is the neutral palette the Android APK ships with; we apply
  // it pre-paint on any phone-sized Android/iPhone WebView so the whole
  // /tv tree (including pages that bypass TvBoot) starts in the right
  // colours.
  var t = localStorage.getItem('ns.theme');
  var allowed = ['apex','aurora','mono','cyber','premium','sage'];
  var pick = (t && allowed.indexOf(t) >= 0) ? t : null;
  if (!pick) {
    var ua = navigator.userAgent || '';
    var isTV = /webOS|Web0S|SmartTV|Tizen|HbbTV|CrKey|AppleTV/i.test(ua);
    var isPhone = !isTV && /Android|iPhone|iPad|Mobile/i.test(ua) &&
                  (window.innerWidth || screen.width || 0) <= 820;
    if (isPhone) pick = 'sage';
  }
  if (pick) {
    document.documentElement.setAttribute('data-theme', pick);
    document.body && document.body.setAttribute('data-theme', pick);
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
