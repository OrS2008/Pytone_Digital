// User record CRUD on Cloudflare KV.
//
// Storage layout:
//   user:<lowercased-email>  → JSON UserRecord
//
// Email is the primary lookup key because every auth flow starts from
// "the user typed an email". The internal userId is the Firebase UID
// (since the Firebase migration) and is the partition key for settings,
// history, and recordings blobs.
//
// Password hashing used to live here too; with Firebase Authentication
// taking over the password store, `passwordHash` is now optional and
// only present on legacy records that haven't been migrated to Firebase
// yet. Login goes through Firebase directly; this module never verifies
// passwords any more.

import type { KVNamespace } from '../cfEnv';

export interface UserRecord {
  userId:        string;       // Firebase UID for new users; legacy random id otherwise.
  email:         string;       // lowercased + trimmed
  /** Legacy pbkdf2 hash. Present only on accounts created before the
   *  Firebase Auth migration. Login does NOT consult this any more —
   *  Firebase is the source of truth — but we keep the field so a
   *  one-shot login-time migration can read it. */
  passwordHash?: string;
  createdAt:     number;
  lastLoginAt?:  number;
  // Trial / subscription enforcement.
  trialStartedAt?:  number;
  subscribedUntil?: number;
}

function userKey(email: string): string { return `user:${normaliseEmail(email)}`; }

export function normaliseEmail(email: string): string { return email.toLowerCase().trim(); }

export async function findUserByEmail(kv: KVNamespace, email: string): Promise<UserRecord | null> {
  if (!email) return null;
  const raw = await kv.get(userKey(email));
  if (!raw) return null;
  try { return JSON.parse(raw) as UserRecord; } catch { return null; }
}

// Create a KV record for a user that lives in Firebase Auth. The
// caller (signup route) has already created the Firebase Auth user
// and hands us the UID. We mirror just enough to drive trial /
// subscription state and the join key for settings.
export async function createUserFromFirebase(
  kv: KVNamespace,
  firebaseUid: string,
  email: string,
): Promise<UserRecord> {
  const now = Date.now();
  const record: UserRecord = {
    userId:         firebaseUid,
    email:          normaliseEmail(email),
    createdAt:      now,
    trialStartedAt: now,
  };
  await kv.put(userKey(email), JSON.stringify(record));
  return record;
}

// Trial / subscription helpers — single source of truth for "does
// this user have access right now". The /tv shell calls /api/auth/me
// which delegates to this; the admin panel uses it for the trialing
// / paid breakdown.
export const TRIAL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AccessState {
  status:           'trial' | 'subscribed' | 'expired';
  trialEndsAt:      number;
  subscribedUntil:  number;
  daysLeft:         number;   // floor; 0 once expired
}

export function accessState(user: UserRecord, now: number = Date.now()): AccessState {
  const trialStartedAt = user.trialStartedAt ?? user.createdAt;
  const trialEndsAt    = trialStartedAt + TRIAL_MS;
  const subbedUntil    = user.subscribedUntil ?? 0;
  const trialActive    = now < trialEndsAt;
  const subActive      = now < subbedUntil;

  let status: AccessState['status'];
  let endMs: number;
  if (subActive)        { status = 'subscribed'; endMs = subbedUntil; }
  else if (trialActive) { status = 'trial';      endMs = trialEndsAt; }
  else                  { status = 'expired';    endMs = 0; }

  const daysLeft = endMs > now ? Math.floor((endMs - now) / (24 * 60 * 60 * 1000)) : 0;
  return { status, trialEndsAt, subscribedUntil: subbedUntil, daysLeft };
}

// Record a successful login. Called from the login route AFTER
// Firebase has accepted the credentials.
export async function touchLastLogin(kv: KVNamespace, user: UserRecord): Promise<void> {
  user.lastLoginAt = Date.now();
  try { await kv.put(userKey(user.email), JSON.stringify(user)); }
  catch { /* best-effort; don't block login */ }
}

