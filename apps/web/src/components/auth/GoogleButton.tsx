'use client';

import { useEffect, useRef, useState } from 'react';

// Google Sign-In button.
//
// Fetches the client id from /api/auth/google-config at runtime
// (rather than relying on NEXT_PUBLIC_* build-time inlining) so the
// button starts working the moment an operator adds GOOGLE_CLIENT_ID
// to the deploy env — no full rebuild required to flip it on.
//
// When the config endpoint returns null the component renders an
// inert "Continue with Google" tile that, when clicked, surfaces a
// generic message so the user knows where to look without exposing
// env-var names.

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

type State =
  | { kind: 'loading' }
  | { kind: 'unconfigured' }
  | { kind: 'ready'; clientId: string }
  | { kind: 'failed' };

export default function GoogleButton({ onSuccess, onError }: Props) {
  const slot = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<State>({ kind: 'loading' });

  // Fetch the client id and bring up the Google library.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      let clientId: string | null = null;
      try {
        const r = await fetch('/api/auth/google-config', { cache: 'no-store' });
        if (r.ok) {
          const data = (await r.json()) as { clientId: string | null };
          clientId = data.clientId;
        }
      } catch { /* network blip */ }

      if (cancelled) return;
      if (!clientId) { setState({ kind: 'unconfigured' }); return; }

      // Load the GIS library if it isn't already in the page.
      try {
        if (!window.google?.accounts?.id) {
          await new Promise<void>((resolve, reject) => {
            const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
            if (existing) {
              existing.addEventListener('load',  () => resolve(), { once: true });
              existing.addEventListener('error', () => reject(new Error('GIS load failed')), { once: true });
              return;
            }
            const s = document.createElement('script');
            s.src = GIS_SRC;
            s.async = true;
            s.defer = true;
            s.onload  = () => resolve();
            s.onerror = () => reject(new Error('GIS load failed'));
            document.head.appendChild(s);
          });
        }
      } catch {
        setState({ kind: 'failed' });
        return;
      }
      if (cancelled) return;
      setState({ kind: 'ready', clientId });
    })();

    return () => { cancelled = true; };
  }, []);

  // Mount the GIS button into our slot once we know the client id
  // and the slot div is in the DOM.
  useEffect(() => {
    if (state.kind !== 'ready') return;
    if (!slot.current || !window.google?.accounts?.id) return;

    window.google.accounts.id.initialize({
      client_id: state.clientId,
      ux_mode: 'popup',
      auto_select: false,
      use_fedcm_for_prompt: false,
      callback: async (response: { credential: string }) => {
        try {
          const r = await fetch('/api/auth/google', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ credential: response.credential }),
          });
          const data = await r.json();
          if (!r.ok) throw new Error(data.error || 'verification failed');
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
      width: 320,
    });
    // state intentionally only — we don't want to re-mount the
    // Google button on parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (state.kind === 'loading' || state.kind === 'unconfigured' || state.kind === 'failed') {
    // Never expose env-var names. Render a graceful placeholder so the
    // layout doesn't jump after the config fetch resolves.
    return null;
  }
  return <div ref={slot} style={{ display: 'flex', justifyContent: 'center' }} />;
}
