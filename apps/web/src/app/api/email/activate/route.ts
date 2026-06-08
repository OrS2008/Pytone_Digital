// POST /api/email/activate — DEPRECATED.
//
// Signup now creates the user in Firebase Authentication and Firebase
// auto-sends the verification email. This route used to call Brevo with
// a homegrown activation token; that path is gone. Kept here as a
// 410 stub so any old client code (cached pages, half-deployed tabs)
// gets a clear signal instead of a 404.

import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST() {
  return NextResponse.json(
    { error: 'deprecated', detail: 'Activation emails are now sent automatically by Firebase Auth on signup.' },
    { status: 410 },
  );
}
