// POST /api/admin/login  { username, password }
//
// Edge-runtime stub. The production implementation uses scrypt from
// node:crypto, which is not available on Cloudflare Workers / Pages
// Functions where this site is deployed today. Until the password
// verification is migrated to a Web Crypto primitive (PBKDF2 or
// Argon2-WASM), the admin sign-in surface returns 503.
//
// The /admin/* routes are still gated by middleware.ts — without a
// successful login the cookie is never minted, so the gate stays
// closed. No security regression from this stub.

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest) {
  return NextResponse.json({
    error: 'Admin login is temporarily unavailable on this deploy.',
    hint:  'The Cloudflare edge runtime does not expose node:crypto.scrypt. Migrate ADMIN_PASSWORD_HASH to a PBKDF2 format and restore the verification logic.',
  }, { status: 503 });
}
