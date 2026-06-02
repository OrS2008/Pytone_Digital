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

const KEY_EMAIL     = 'ns.session.email';
const KEY_ACTIVATED = 'ns.session.activated';
const KEY_NAME      = 'ns.session.name';
const KEY_PICTURE   = 'ns.session.picture';
const KEY_TRIAL_AT  = 'ns.session.trialStartedAt';

export function getSessionEmail(): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem(KEY_EMAIL); } catch { return null; }
}

export function setSessionEmail(email: string) {
  try { localStorage.setItem(KEY_EMAIL, email.toLowerCase().trim()); } catch { /* ignore */ }
}

// Activation state — a user has to verify their email before the
// account section opens. Google sign-in counts as verified
// (Google itself confirmed `email_verified=true`); email/password
// sign-ups stay pending until they click the activation link from
// /tv/activate.
export function isActivated(): boolean {
  if (typeof window === 'undefined') return false;
  try { return localStorage.getItem(KEY_ACTIVATED) === '1'; } catch { return false; }
}

export function setActivated(on: boolean) {
  try {
    if (on) {
      localStorage.setItem(KEY_ACTIVATED, '1');
      // First activation also starts the trial clock so the
      // subscription / overview screens have real "started" /
      // "ends" dates to show instead of em-dashes.
      if (!localStorage.getItem(KEY_TRIAL_AT)) {
        localStorage.setItem(KEY_TRIAL_AT, String(Date.now()));
      }
    } else {
      localStorage.removeItem(KEY_ACTIVATED);
    }
  } catch { /* ignore */ }
}

// Trial timing. Returns 0 if the trial hasn't been started yet — the UI
// hides the dates in that case rather than rendering "Jan 1, 1970".
export function getTrialStartedAt(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const v = localStorage.getItem(KEY_TRIAL_AT);
    return v ? Number(v) || 0 : 0;
  } catch { return 0; }
}
export const TRIAL_DAYS = 7;
export function getTrialEndsAt(): number {
  const start = getTrialStartedAt();
  return start === 0 ? 0 : start + TRIAL_DAYS * 24 * 60 * 60 * 1000;
}

export function getSessionName():    string | null { if (typeof window === 'undefined') return null; try { return localStorage.getItem(KEY_NAME); }    catch { return null; } }
export function getSessionPicture(): string | null { if (typeof window === 'undefined') return null; try { return localStorage.getItem(KEY_PICTURE); } catch { return null; } }

// Sign-out clears the session pointer but keeps each user's saved data
// alive (the keys are namespaced so signing back in restores everything
// without crossing tenants). Then we reload so every mounted component
// sees the new identity from scratch.
//
// The server session cookie has to be cleared too — calling
// /api/auth/logout asks the edge to invalidate the KV session record
// AND emit a Set-Cookie that empties ns_session in the browser. The
// fetch is fire-and-forget; even on failure we still navigate away.
export function signOut() {
  try {
    localStorage.removeItem(KEY_EMAIL);
    localStorage.removeItem(KEY_ACTIVATED);
    localStorage.removeItem(KEY_NAME);
    localStorage.removeItem(KEY_PICTURE);
    // The trial clock is per-account, not per-session — leave it so a
    // re-login doesn't reset the 7-day window.
  } catch { /* ignore */ }
  if (typeof window === 'undefined') return;
  fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    .catch(() => { /* ignore — we still want to navigate */ })
    .finally(() => { window.location.href = '/tv/login'; });
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
