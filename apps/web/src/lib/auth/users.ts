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
  const record: UserRecord = {
    userId:    randomId(),
    email:     normaliseEmail(email),
    passwordHash,
    createdAt: Date.now(),
  };
  await kv.put(userKey(email), JSON.stringify(record));
  return record;
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
