import type { Metadata } from 'next';
import './globals.css';
import './tv/themes.css';

export const metadata: Metadata = {
  title: 'Nova Stream',
  description: 'The next generation of streaming.',
};

// Read the saved theme before paint so the page never flashes the
// default palette and then re-renders with the user's choice. Runs
// before React hydration. Mirrors the bootstrap that also lives in
// TvBoot for client-side updates.
const THEME_BOOT = `
(function(){try{
  var t=localStorage.getItem('ns.theme');
  if(t && ['apex','aurora','mono','cyber','premium'].indexOf(t)>=0){
    document.documentElement.setAttribute('data-theme',t);
    document.body && document.body.setAttribute('data-theme',t);
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
