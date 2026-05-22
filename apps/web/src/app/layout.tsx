import type { Metadata } from 'next';
import './globals.css';
import './tv/themes.css';

export const metadata: Metadata = {
  title: 'Nova Stream',
  description: 'The next generation of streaming.',
};

// Read the saved theme + locale before paint so the page never flashes
// the default palette or LTR direction and then re-renders with the
// user's choice. Runs before React hydration. Mirrors the bootstrap
// that also lives in TvBoot for client-side updates.
const THEME_BOOT = `
(function(){try{
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
