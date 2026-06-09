'use client';

// /tv/activate — DEPRECATED.
//
// The pre-Firebase activation flow lived here: signup generated a
// custom token, the user clicked a link to /tv/activate?token=X, and
// this page flipped a local "activated" flag. Firebase Authentication
// now owns email verification end-to-end (see /tv/auth-action) so
// nothing in the active codebase points here any more. Old emails
// floating around in inboxes still might, though — so we keep the
// route as a polite redirect to the new auth-action handler. The
// outer Suspense exists because useSearchParams forces a client
// boundary that Next 15's static export bails out of otherwise.

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

function ActivateRedirect() {
  const params = useSearchParams();
  useEffect(() => {
    const qs = params.toString();
    window.location.replace(qs ? `/tv/auth-action?${qs}` : '/tv/login?verified=1');
  }, [params]);
  return (
    <main style={{ padding: 48, color: '#8B95A7', textAlign: 'center' }}>
      Redirecting…
    </main>
  );
}

export default function ActivatePage() {
  return <Suspense fallback={null}><ActivateRedirect /></Suspense>;
}
