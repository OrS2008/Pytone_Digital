'use client';

import { useEffect, useRef, useState } from 'react';

// Google Sign-In button.
//
// We load the Google Identity Services library on demand, render the
// official Google-styled button into the `ref` div, and forward the
// credential to /api/auth/google for server-side verification. On
// success the caller decides where to go next (set the session,
// redirect to /tv).
//
// If the deploy hasn't configured NEXT_PUBLIC_GOOGLE_CLIENT_ID we
// render an inline hint instead of a broken button.

interface User { email: string; name?: string | null; picture?: string | null; }

interface Props {
  onSuccess: (user: User) => void;
  onError?: (message: string) => void;
}

interface GIS {
  accounts: {
    id: {
      initialize: (config: Record<string, unknown>) => void;
      renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
      prompt: () => void;
    };
  };
}

declare global {
  interface Window { google?: GIS }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';

export default function GoogleButton({ onSuccess, onError }: Props) {
  const slot = useRef<HTMLDivElement | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      // Quietly hide the button when the OAuth client id isn't set —
      // users should never see a developer-facing "add env var" hint.
      // The email form below the button is still a full path in.
      setHint('hidden');
      return;
    }

    let cancelled = false;

    async function init() {
      if (!window.google?.accounts?.id) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
          if (existing) {
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error('GIS load failed')), { once: true });
            return;
          }
          const s = document.createElement('script');
          s.src = GIS_SRC;
          s.async = true;
          s.defer = true;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error('GIS load failed'));
          document.head.appendChild(s);
        });
      }
      if (cancelled || !slot.current || !window.google?.accounts?.id) return;

      window.google.accounts.id.initialize({
        client_id: clientId,
        ux_mode: 'popup',
        auto_select: false,
        // Cookie + One-Tap collision protection: this site is its own
        // OAuth realm, no FedCM hand-off to other tabs.
        use_fedcm_for_prompt: false,
        callback: async (response: { credential: string }) => {
          try {
            const r = await fetch('/api/auth/google', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ credential: response.credential }),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.hint ? `${data.error} ${data.hint}` : data.error || 'verification failed');
            onSuccess(data as User);
          } catch (e) {
            onError?.((e as Error).message);
          }
        },
      });

      window.google.accounts.id.renderButton(slot.current, {
        type:  'standard',
        theme: 'filled_black',
        size:  'large',
        text:  'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        // GIS measures pixel width and refuses to render < 200 or > 400.
        // We use 320 so the button matches the form width on the auth
        // card layout.
        width: 320,
      });
    }

    init().catch((e: Error) => onError?.(e.message));
    return () => { cancelled = true; };
    // onSuccess / onError captured via closure on first mount; we don't
    // want to re-mount the Google button on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // hint === 'hidden' means we deliberately suppress the button.
  if (hint) return null;
  return <div ref={slot} style={{ display: 'flex', justifyContent: 'center' }} />;
}
