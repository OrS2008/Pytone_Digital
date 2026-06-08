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
  readPreverifyCookie,
  deletePreverifyHandle,
  clearPreverifyCookieHeader,
  createPreverifyHandle,
  setPreverifyCookieHeader,
} from '@/lib/auth/preverify';
import {
  firebaseSignin,
  firebaseSignup,
  firebaseLookupByIdToken,
  FirebaseAuthError,
  FirebaseNotConfiguredError,
  type FirebaseUser,
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

  let firebaseUser: FirebaseUser | null = null;
  let migratedLegacy = false;
  try {
    firebaseUser = await firebaseSignin(email, password);
  } catch (e) {
    if (e instanceof FirebaseNotConfiguredError) {
      return NextResponse.json({ error: 'auth_unconfigured' }, { status: 503 });
    }
    if (e instanceof FirebaseAuthError) {
      // Legacy migration: user pre-dates Firebase Auth — if the KV
      // hash still matches, mint them a Firebase user now.
      if (/EMAIL_NOT_FOUND/.test(e.code)) {
        const fb = await migrateLegacyToFirebase(kv, email, password);
        if (fb) { firebaseUser = fb; migratedLegacy = true; }
        else    { return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 }); }
      } else {
        return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
      }
    } else {
      throw e;
    }
  }

  // Email-verification gate. New signups must click the link Firebase
  // emailed them before they can sign in. Legacy migrated users skip
  // the gate — they were active in Nova Stream before the Firebase
  // switchover, so the address is implicitly trusted.
  let emailVerified = false;
  try {
    const info = await firebaseLookupByIdToken(firebaseUser!.idToken);
    emailVerified = info?.emailVerified === true;
  } catch { /* network glitch — fall through; KV-marked legacy still passes */ }

  // Look up — or lazily create — our KV record. A Firebase account
  // can pre-exist us; in that case we mint a KV row so the trial
  // clock starts.
  let user = await findUserByEmail(kv, email);
  if (!user) {
    user = await createUserFromFirebase(kv, firebaseUser!.localId, email);
    if (migratedLegacy) {
      user.legacyMigrated = true;
      await kv.put(`user:${email}`, JSON.stringify(user));
    }
  } else if (user.userId !== firebaseUser!.localId) {
    // Align the legacy random userId with the Firebase UID so future
    // settings/history blobs share one partition.
    user = { ...user, userId: firebaseUser!.localId, passwordHash: undefined, legacyMigrated: true };
    await kv.put(`user:${email}`, JSON.stringify(user));
  }

  if (!emailVerified && !user.legacyMigrated) {
    // Mint a pre-verify handle so /tv/check-email's resend button
    // works without forcing the user to re-enter the password they
    // just typed. The handle holds the refresh token, not the
    // password itself.
    const preverifyToken = await createPreverifyHandle(kv, user.email, firebaseUser!.refreshToken);
    return new NextResponse(
      JSON.stringify({ error: 'email_not_verified', email }),
      {
        status: 403,
        headers: {
          'content-type': 'application/json',
          'set-cookie':   setPreverifyCookieHeader(preverifyToken),
        },
      },
    );
  }

  await touchLastLogin(kv, user);

  const sid = await createSession(kv, user.userId, user.email, {
    userAgent: req.headers.get('user-agent') ?? undefined,
    ip:        req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? undefined,
  });

  // Once a real session is in hand the pre-verify handle is dead
  // weight — drop the KV row and clear the cookie alongside the new
  // session cookie.
  const preverifyCookie = readPreverifyCookie(req);
  if (preverifyCookie) await deletePreverifyHandle(kv, preverifyCookie);

  const headers = new Headers({ 'content-type': 'application/json' });
  headers.append('set-cookie', setSessionCookieHeader(sid));
  headers.append('set-cookie', clearPreverifyCookieHeader());

  return new NextResponse(JSON.stringify({ ok: true, email: user.email }), {
    status: 200,
    headers,
  });
}

// Migrates a pre-Firebase KV user into Firebase Auth using the
// password they just submitted. Returns the freshly-minted Firebase
// user on success, null on any mismatch or race (caller treats null
// as "invalid credentials" so the migration path can't be used to
// probe existing emails).
async function migrateLegacyToFirebase(
  kv: import('@/lib/cfEnv').KVNamespace,
  email: string,
  password: string,
): Promise<FirebaseUser | null> {
  const user = await findUserByEmail(kv, email);
  if (!user || !user.passwordHash) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  try {
    return await firebaseSignup(email, password);
  } catch (e) {
    if (e instanceof FirebaseAuthError && /EMAIL_EXISTS/.test(e.code)) return null;
    throw e;
  }
}
