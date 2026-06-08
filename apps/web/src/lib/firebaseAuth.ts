// Firebase Authentication REST API wrapper.
//
// Why REST and not the Admin SDK: the Admin SDK is Node-only (uses
// `firebase-admin` which depends on grpc + service-account JWT signing
// with the `jsonwebtoken` package). Cloudflare Pages Functions run on
// the edge / Workers runtime, which is V8 isolate-based and cannot
// load `firebase-admin`. The Identity Toolkit REST API works fine over
// plain fetch and only needs the Web API key (which is designed to be
// public — it identifies the project but does not authorise admin
// operations on its own; sensitive ops still need ID token / OOB code
// proof of identity).
//
// Endpoints reference:
//   https://firebase.google.com/docs/reference/rest/auth
//
// We use:
//   accounts:signUp            — create a new email/password user.
//   accounts:signInWithPassword — verify a password, returns idToken
//                                 + refreshToken + localId.
//   accounts:sendOobCode       — trigger Firebase to email a
//                                 verification or password-reset link
//                                 to the user.
//   accounts:lookup            — read a user record (emailVerified,
//                                 etc.) by idToken or localId.
//   accounts:update            — change a user's password / displayName.
//
// All errors come back as `{ error: { code, message } }` with a stable
// message string we can match on (e.g. `EMAIL_NOT_FOUND`,
// `INVALID_PASSWORD`, `EMAIL_EXISTS`).

const ENDPOINT = 'https://identitytoolkit.googleapis.com/v1';

function apiKey(): string {
  const k = process.env.FIREBASE_API_KEY;
  if (!k) throw new FirebaseNotConfiguredError('FIREBASE_API_KEY env var missing');
  return k;
}

export class FirebaseNotConfiguredError extends Error {
  constructor(msg = 'Firebase Auth is not configured.') {
    super(msg);
    this.name = 'FirebaseNotConfiguredError';
  }
}

export class FirebaseAuthError extends Error {
  status:  number;
  /** Firebase canonical error code, e.g. `EMAIL_NOT_FOUND`. */
  code:    string;
  /** Raw response body (first 400 chars) for diagnostics. */
  body:    string;

  constructor(status: number, code: string, body: string) {
    super(`Firebase ${status}: ${code}`);
    this.name = 'FirebaseAuthError';
    this.status = status;
    this.code   = code;
    this.body   = body;
  }
}

interface ErrorEnvelope {
  error?: { code?: number; message?: string };
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const url = `${ENDPOINT}/${path}?key=${encodeURIComponent(apiKey())}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) {
    let code = 'unknown';
    try {
      const j = JSON.parse(text) as ErrorEnvelope;
      if (j?.error?.message) code = j.error.message;
    } catch { /* not JSON */ }
    throw new FirebaseAuthError(r.status, code, text.slice(0, 400));
  }
  try { return JSON.parse(text) as T; }
  catch { throw new FirebaseAuthError(r.status, 'bad_json', text.slice(0, 400)); }
}

// --- account operations -------------------------------------------------

export interface FirebaseUser {
  localId:        string;        // Firebase UID — what we store as userId
  email:          string;
  idToken:        string;        // short-lived (1h) JWT
  refreshToken:   string;        // long-lived; not used here yet
  expiresIn:      string;        // seconds, as string
}

export async function firebaseSignup(email: string, password: string): Promise<FirebaseUser> {
  return call<FirebaseUser>('accounts:signUp', {
    email, password, returnSecureToken: true,
  });
}

export async function firebaseSignin(email: string, password: string): Promise<FirebaseUser> {
  return call<FirebaseUser>('accounts:signInWithPassword', {
    email, password, returnSecureToken: true,
  });
}

interface OobCodeRequest {
  requestType:  'VERIFY_EMAIL' | 'PASSWORD_RESET';
  email?:       string;
  idToken?:     string;
  continueUrl?: string;
}

// Triggers Firebase to email a link. `requestType=VERIFY_EMAIL` needs
// an idToken (proof the requester just signed in / signed up).
// `requestType=PASSWORD_RESET` just needs an email; Firebase ignores
// the request if the email isn't registered (we still get 200 OK so
// the caller can't enumerate).
export async function firebaseSendOobCode(req: OobCodeRequest): Promise<void> {
  await call('accounts:sendOobCode', req as unknown as Record<string, unknown>);
}

export interface FirebaseUserInfo {
  localId:        string;
  email:          string;
  emailVerified:  boolean;
  displayName?:   string;
  createdAt?:     string;
  lastLoginAt?:   string;
}

export async function firebaseLookupByIdToken(idToken: string): Promise<FirebaseUserInfo | null> {
  interface LookupResp { users?: FirebaseUserInfo[] }
  const r = await call<LookupResp>('accounts:lookup', { idToken });
  return r.users?.[0] ?? null;
}

export async function firebaseChangePassword(idToken: string, newPassword: string): Promise<FirebaseUser> {
  return call<FirebaseUser>('accounts:update', {
    idToken, password: newPassword, returnSecureToken: true,
  });
}

// Apply an out-of-band code (the `oobCode` query param in the link
// Firebase emails). For email verification this flips emailVerified
// to true on the matching account. Single-use — the second call with
// the same code returns INVALID_OOB_CODE / EXPIRED_OOB_CODE.
//
// Response includes the email + the localId so the caller can finish
// the verification flow without re-asking the user who they are.
export interface ApplyOobResult {
  email:        string;
  localId?:     string;
  emailVerified?: boolean;
  /** "VERIFY_EMAIL" | "PASSWORD_RESET" | "EMAIL_SIGNIN" | ... */
  requestType?: string;
}
export async function firebaseApplyOobCode(oobCode: string): Promise<ApplyOobResult> {
  return call<ApplyOobResult>('accounts:update', { oobCode });
}

// Exchange a refresh token for a fresh idToken. The endpoint lives on
// a different host (securetoken.googleapis.com) and accepts
// form-encoded data, not JSON — separate from the identitytoolkit
// API. Returns a brand-new refresh token too so callers should
// rotate-store it.
export interface RefreshResult {
  id_token:      string;
  refresh_token: string;
  expires_in:    string;
  user_id:       string;
  project_id:    string;
}
// Validate a password-reset oobCode without consuming it. Returns
// the email the code was issued for so the UI can confirm "we're
// resetting the password for X" before asking the user to type the
// new one.
export async function firebaseVerifyPasswordResetCode(oobCode: string): Promise<{ email: string; requestType?: string }> {
  return call<{ email: string; requestType?: string }>('accounts:resetPassword', { oobCode });
}

// Consume the oobCode + set the new password. Firebase returns only
// the email — no tokens — so the caller has to follow up with a
// signInWithPassword to create a session.
export async function firebaseConfirmPasswordReset(oobCode: string, newPassword: string): Promise<{ email: string; requestType?: string }> {
  return call<{ email: string; requestType?: string }>('accounts:resetPassword', { oobCode, newPassword });
}

export async function firebaseExchangeRefreshToken(refreshToken: string): Promise<RefreshResult> {
  const url = `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey())}`;
  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
  });
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await r.text();
  if (!r.ok) {
    let code = 'unknown';
    try {
      const j = JSON.parse(text) as ErrorEnvelope;
      if (j?.error?.message) code = j.error.message;
    } catch { /* ignore */ }
    throw new FirebaseAuthError(r.status, code, text.slice(0, 400));
  }
  try { return JSON.parse(text) as RefreshResult; }
  catch { throw new FirebaseAuthError(r.status, 'bad_json', text.slice(0, 400)); }
}
