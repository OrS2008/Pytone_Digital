// Client-side session — knows which user is "signed in" right now.
//
// Demo limits: localStorage on the same browser cannot give cryptographic
// isolation between users — anyone with file-system access to the
// browser profile can read everything. The frontend can only namespace
// by a logical user id (email) so the *application* doesn't mix tenants.
//
// True isolation happens at the auth-service + Postgres layer once the
// backend is deployed; the Postgres schema in services/auth/migrations/
// already keys every source row by user_id, and the gateway refuses to
// return another user's rows.

'use client';

const KEY_EMAIL = 'ns.session.email';

export function getSessionEmail(): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem(KEY_EMAIL); } catch { return null; }
}

export function setSessionEmail(email: string) {
  try { localStorage.setItem(KEY_EMAIL, email.toLowerCase().trim()); } catch { /* ignore */ }
}

// Sign-out clears the session pointer but keeps each user's saved data
// alive (the keys are namespaced so signing back in restores everything
// without crossing tenants). Then we reload so every mounted component
// sees the new identity from scratch.
export function signOut() {
  try { localStorage.removeItem(KEY_EMAIL); } catch { /* ignore */ }
  if (typeof window !== 'undefined') window.location.href = '/tv/login';
}

// Stable, short, opaque tenant id derived from the email so the
// localStorage keys don't include raw addresses (and `storage` events
// from devtools don't immediately show who's logged in).
export function tenantId(): string {
  const email = getSessionEmail();
  if (!email) return 'anon';
  // FNV-1a 32-bit. Plenty for namespacing inside a single browser; this
  // is not a security boundary, just a short stable key.
  let h = 0x811c9dc5;
  for (let i = 0; i < email.length; i++) {
    h ^= email.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return 'u' + h.toString(36);
}

export function userKey(key: string): string {
  return `ns:${tenantId()}:${key}`;
}
