// Canonical public origin for building links that go into emails.
//
// Email links (Firebase continueUrl for verification / reset) must
// point at OUR site. The old originUrl() trusted the `x-forwarded-host`
// request header, which a client can forge — letting an attacker make
// the verification link in a victim's inbox point at evil.com and
// harvest the click.
//
// Resolution order:
//   1. PUBLIC_BASE_URL env (operator-pinned, e.g.
//      "https://nova-stream-cce.pages.dev"). Unforgeable — set it in
//      the deploy and every link is correct regardless of headers.
//   2. The `host` header (set by the Cloudflare edge, NOT the
//      client-controlled x-forwarded-host) combined with the
//      forwarded proto. Used only when PUBLIC_BASE_URL is absent.
//
// `x-forwarded-host` is deliberately ignored.

export function canonicalOrigin(req: Request): string {
  const pinned = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (pinned && /^https?:\/\//i.test(pinned)) return pinned;

  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host  = req.headers.get('host'); // platform-set, not client x-forwarded-host
  if (host) return `${proto}://${host}`;

  try { return new URL(req.url).origin; } catch { return ''; }
}
