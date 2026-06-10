import type { MetadataRoute } from 'next';

// Web App Manifest — makes Nova Stream installable on Android / iOS as
// a standalone app ("Add to Home Screen") and is what PWABuilder reads
// to generate a signed APK from the live URL. Served at /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             'Nova Stream',
    short_name:       'Nova Stream',
    description:      'Your IPTV — live TV, programme guide and catch-up, on every screen.',
    start_url:        '/tv',
    scope:            '/',
    display:          'standalone',
    orientation:      'any',
    background_color: '#0F1116',
    theme_color:      '#0F1116',
    categories:       ['entertainment', 'video'],
    icons: [
      { src: '/icon-192.png',           sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png',           sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png',  sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
