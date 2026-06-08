// POST /api/auth/login — verify password via Firebase Auth, mint a session.
//
// Body: { email, password }
// Response: 200 + { ok: true, email } and Set-Cookie: ns_session=...
// Errors:
//   400 — missing fields
//   401 — wrong email / password (single code so attackers can't
//         enumerate registered emails)
//   503 — NOVA_KV or FIREBASE_API_KEY not configured
//
// Migration path for legacy users (pre-Firebase signup):
//   - Firebase says EMAIL_NOT_FOUND.
//   - KV has the user with a `passwordHash` matching the submitted
//     password.
//   - We create the user in Firebase with the same password and
//     proceed. The legacy hash is dropped from the KV record on the
//     next write so subsequent logins go straight through Firebase.

import { NextRequest, NextResponse } from 'next/server';
import { requireKV } from '@/lib/cfEnv';
import { findUserByEmail, createUserFromFirebase, normaliseEmail, touchLastLogin } from '@/lib/auth/users';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, setSessionCookieHeader } from '@/lib/auth/serverSession';
import {
  firebaseSignin,
  firebaseSignup,
  FirebaseAuthError,
  FirebaseNotConfiguredError,
} from '@/lib/firebaseAuth';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const kv = requireKV();
  if (kv instanceof Response) return kv;

  let body: { email?: unknown; password?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }

  const email    = typeof body.email    === 'string' ? normaliseEmail(body.email) : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  let firebaseUid: string;
  try {
    const fbUser = await firebaseSignin(email, password);
    firebaseUid = fbUser.localId;
  } catch (e) {
    if (e instanceof FirebaseNotConfiguredError) {
      return NextResponse.json({ error: 'auth_unconfigured' }, { status: 503 });
    }
    if (e instanceof FirebaseAuthError) {
      // Legacy migration: this user signed up before the Firebase
      // switchover so there's no Firebase Auth record yet. If the KV
      // password hash verifies, mint a Firebase user for them now
      // with the same password — subsequent logins flow straight
      // through Firebase, transparent to the user.
      if (/EMAIL_NOT_FOUND/.test(e.code)) {
        const migrated = await migrateLegacyToFirebase(kv, email, password);
        if (migrated) {
          firebaseUid = migrated;
        } else {
          return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
        }
      } else {
        // INVALID_PASSWORD, INVALID_EMAIL, USER_DISABLED, etc. all
        // collapse to a single 401 so attackers can't enumerate.
        return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
      }
    } else {
      throw e;
    }
  }

  // Look up — or lazily create — our KV record. A Firebase account
  // can pre-exist us (someone signed up via Firebase Console, or via a
  // future password-reset that fires before signup); in that case we
  // mint a KV row so the trial clock starts.
  let user = await findUserByEmail(kv, email);
  if (!user) {
    user = await createUserFromFirebase(kv, firebaseUid, email);
  } else if (user.userId !== firebaseUid) {
    // Migration housekeeping: align the legacy random userId with the
    // Firebase UID so settings/history blobs use a single partition
    // going forward.
    user = { ...user, userId: firebaseUid, passwordHash: undefined };
    await kv.put(`user:${email}`, JSON.stringify(user));
  }

  await touchLastLogin(kv, user);

  const sid = await createSession(kv, user.userId, user.email, {
    userAgent: req.headers.get('user-agent') ?? undefined,
    ip:        req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? undefined,
  });
  return new NextResponse(JSON.stringify({ ok: true, email: user.email }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie':   setSessionCookieHeader(sid),
    },
  });
}

// Returns the new Firebase UID when the legacy password matches and
// Firebase signup succeeded, null otherwise (caller treats null as
// "invalid credentials" so the migration path can't be used to probe
// existing emails).
async function migrateLegacyToFirebase(
  kv: import('@/lib/cfEnv').KVNamespace,
  email: string,
  password: string,
): Promise<string | null> {
  const user = await findUserByEmail(kv, email);
  if (!user || !user.passwordHash) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  try {
    const fb = await firebaseSignup(email, password);
    return fb.localId;
  } catch (e) {
    // If Firebase says the email already exists (race with another
    // tab) just give up — the next login attempt will try signin
    // first and succeed.
    if (e instanceof FirebaseAuthError && /EMAIL_EXISTS/.test(e.code)) return null;
    throw e;
  }
}
