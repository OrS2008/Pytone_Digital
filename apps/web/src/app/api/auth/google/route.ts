// POST /api/auth/google
//
// Verifies a Google Identity Services credential (ID token) and returns
// the verified email / name / picture. The browser cannot trust a JWT
// it received from itself — anyone with the page open could craft one —
// so this server route re-validates the token against Google's
// tokeninfo endpoint, which checks the signature, expiry, audience and
// email_verified flag.
//
// Flow:
//   1. /tv/login renders Google's Sign-In button.
//   2. The user picks a Google account in the popup.
//   3. GIS hands the frontend a `credential` (ID-token JWT).
//   4. Frontend POSTs it here.
//   5. We hit Google's tokeninfo with id_token=<credential>.
//   6. We assert iss, aud (= our client id), exp, and email_verified.
//   7. We return the email so the frontend can call setSessionEmail.

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface GoogleTokenInfo {
  iss?: string;
  aud?: string;
  azp?: string;
  exp?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  sub?: string;
  error_description?: string;
}

export async function POST(req: NextRequest) {
  const clientId =
    process.env.GOOGLE_CLIENT_ID ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({
      error: 'Google sign-in is not configured for this deploy.',
      hint:  'Add NEXT_PUBLIC_GOOGLE_CLIENT_ID (and optionally GOOGLE_CLIENT_ID with the same value) to the Netlify env, then redeploy.',
    }, { status: 503 });
  }

  let body: { credential?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON body required.' }, { status: 400 }); }

  const credential = body.credential;
  if (!credential || typeof credential !== 'string') {
    return NextResponse.json({ error: '`credential` field required.' }, { status: 400 });
  }

  let info: GoogleTokenInfo;
  try {
    const r = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
      { headers: { 'cache-control': 'no-store' } },
    );
    info = await r.json();
    if (!r.ok || info.error_description) {
      return NextResponse.json({
        error: `Google rejected the token: ${info.error_description ?? r.statusText}`,
      }, { status: 401 });
    }
  } catch (e) {
    return NextResponse.json({ error: `tokeninfo unreachable: ${(e as Error).message}` }, { status: 502 });
  }

  // Issuer must be Google.
  const iss = info.iss;
  if (iss !== 'https://accounts.google.com' && iss !== 'accounts.google.com') {
    return NextResponse.json({ error: `Bad issuer: ${iss}` }, { status: 401 });
  }
  // Audience must match the OAuth client we configured. `azp` is the
  // authorised party — checked against the same client id to defend
  // against a different app forwarding their token at us.
  if (info.aud !== clientId) {
    return NextResponse.json({ error: 'Token audience does not match this site.' }, { status: 401 });
  }
  if (info.azp && info.azp !== clientId) {
    return NextResponse.json({ error: 'Token authorised party does not match this site.' }, { status: 401 });
  }
  const exp = Number(info.exp);
  if (!exp || exp < Math.floor(Date.now() / 1000)) {
    return NextResponse.json({ error: 'Token expired.' }, { status: 401 });
  }
  const verified = info.email_verified === true || info.email_verified === 'true';
  if (!verified || !info.email) {
    return NextResponse.json({ error: 'Google did not confirm this email.' }, { status: 401 });
  }

  return NextResponse.json({
    email:   info.email,
    name:    info.name ?? info.given_name ?? null,
    picture: info.picture ?? null,
  });
}
