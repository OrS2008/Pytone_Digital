// GET /api/admin/diag
//
// Read-only diagnostic for the admin login deploy. Tells the operator
// whether each required env var is present and whether the password
// hash is in the expected format — and nothing else. Earlier versions
// echoed iteration count and salt / hash byte lengths, which is enough
// for an attacker to tune an offline brute-force, so this build trims
// the response down to booleans.

import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  const u    = process.env.ADMIN_USERNAME;
  const hash = process.env.ADMIN_PASSWORD_HASH;
  const sec  = process.env.ADMIN_SESSION_SECRET;

  // Format check: scheme + 3 colon-separated parts, all hex where expected.
  const parts = (hash || '').split(':');
  const hashFormatOk =
    parts.length === 4 &&
    parts[0] === 'pbkdf2' &&
    /^\d+$/.test(parts[1]) &&
    /^[0-9a-f]+$/i.test(parts[2]) &&
    /^[0-9a-f]+$/i.test(parts[3]);

  return NextResponse.json({
    ADMIN_USERNAME:       { set: !!u },
    ADMIN_PASSWORD_HASH:  { set: !!hash, format_ok: hashFormatOk },
    ADMIN_SESSION_SECRET: { set: !!sec,  long_enough: !!sec && sec.length >= 32 },
  });
}
