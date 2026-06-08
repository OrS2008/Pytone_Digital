'use client';

// /tv/reset-password — DEPRECATED.
//
// Firebase Authentication now hosts the password reset flow. The link
// in the reset email points straight at Firebase's `__/auth/action`
// page; the user picks a new password there and gets redirected back
// to /tv/login. This route stays for any cached bookmarks / half-
// deployed clients and just nudges the user back to the start.

import Link from 'next/link';
import '../auth/auth.css';

export default function ResetPasswordPage() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Use the link in your email</h1>
        <p className="auth-sub">
          Password resets are now handled by the link in the email you received
          from Nova Stream. Open that link to set a new password.
        </p>
        <p className="auth-sub" style={{ marginTop: 14 }}>
          Didn&apos;t get one?{' '}
          <Link href="/tv/forgot-password" className="auth-link">
            Request a fresh link
          </Link>
          .
        </p>
        <p className="auth-sub" style={{ marginTop: 14 }}>
          <Link href="/tv/login" className="auth-link">← Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
