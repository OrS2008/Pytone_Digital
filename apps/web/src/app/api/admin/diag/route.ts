// GET /api/admin/diag
//
// Read-only diagnostic for the admin login deploy. Returns whether each
// required env var is set and whether ADMIN_PASSWORD_HASH is in the
// expected pbkdf2 format. Never echoes the values themselves.
//
// Lets the operator confirm Cloudflare actually picked the variables up
// after a redeploy, without scraping logs.

import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  const u    = process.env.ADMIN_USERNAME;
  const hash = process.env.ADMIN_PASSWORD_HASH;
  const sec  = process.env.ADMIN_SESSION_SECRET;

  const hashParts = (hash || '').split(':');
  const hashFormatOk =
    hashParts.length === 4 &&
    hashParts[0] === 'pbkdf2' &&
    /^\d+$/.test(hashParts[1]) &&
    /^[0-9a-f]+$/i.test(hashParts[2]) &&
    /^[0-9a-f]+$/i.test(hashParts[3]);

  return NextResponse.json({
    ADMIN_USERNAME: {
      set:    !!u,
      length: u ? u.length : 0,
    },
    ADMIN_PASSWORD_HASH: {
      set:               !!hash,
      length:            hash ? hash.length : 0,
      format_ok:         hashFormatOk,
      scheme:            hashParts[0] || null,
      iterations:        hashFormatOk ? Number(hashParts[1]) : null,
      salt_hex_length:   hashParts[2] ? hashParts[2].length : 0,
      hash_hex_length:   hashParts[3] ? hashParts[3].length : 0,
    },
    ADMIN_SESSION_SECRET: {
      set:        !!sec,
      length:     sec ? sec.length : 0,
      long_enough: !!sec && sec.length >= 32,
    },
  });
}
