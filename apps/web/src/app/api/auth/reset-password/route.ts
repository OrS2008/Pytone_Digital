// POST /api/auth/reset-password — DEPRECATED.
//
// Password resets are now handled end-to-end by Firebase Authentication:
//   1. The user requests a reset via /api/auth/forgot-password.
//   2. Firebase emails a link to its hosted action page.
//   3. The user enters the new password on Firebase's page; Firebase
//      updates its auth record.
//   4. The next /api/auth/login call uses the new Firebase password
//      transparently — there's no local password hash to keep in sync.
//
// Kept as a 410 stub so the old /tv/reset-password link in any cached
// browser tabs gets a clear "this page no longer exists; check your
// email for the new link from Firebase" signal instead of a 404.

import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST() {
  return NextResponse.json(
    { error: 'deprecated', detail: 'Password resets are now completed via the Firebase email link.' },
    { status: 410 },
  );
}
