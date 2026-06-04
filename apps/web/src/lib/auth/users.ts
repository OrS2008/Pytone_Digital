// User record CRUD on Cloudflare KV.
//
// Storage layout:
//   user:<lowercased-email>  → JSON UserRecord
//
// Email is the primary key because every auth flow (signup, login,
// password reset) starts from "the user typed an email". Storing under
// the email avoids a second index and keeps the auth code trivial.
// The internal userId is the partition for settings and history blobs
// so renaming/changing email later doesn't require migrating data.

import type { KVNamespace } from '../cfEnv';
import { hashPassword, randomId, verifyPassword } from './password';

export interface UserRecord {
  userId:        string;
  email:         string;       // lowercased + trimmed
  passwordHash:  string;       // pbkdf2$... format from auth/password
  createdAt:     number;
  lastLoginAt?:  number;
  // Trial / subscription enforcement.
  //   trialStartedAt — stamped at createUser(); the 7-day clock runs
  //     from this and is the authoritative source for "is the trial
  //     still active" (the client-side localStorage value used to be
  //     authoritative but trivially lied about). Defaults to
  //     createdAt for users that pre-date this field.
  //   subscribedUntil — non-zero when a paid subscription has been
  //     verified by the billing webhook. Either of trial or
  //     subscription being valid grants access.
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

export async function createUser(kv: KVNamespace, email: string, password: string): Promise<UserRecord> {
  const passwordHash = await hashPassword(password);
  const now = Date.now();
  const record: UserRecord = {
    userId:    randomId(),
    email:     normaliseEmail(email),
    passwordHash,
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

export async function loginUser(kv: KVNamespace, email: string, password: string): Promise<UserRecord | null> {
  const user = await findUserByEmail(kv, email);
  if (!user) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  user.lastLoginAt = Date.now();
  // Best-effort timestamp update — failures here don't block login.
  try { await kv.put(userKey(email), JSON.stringify(user)); } catch { /* ignore */ }
  return user;
}
