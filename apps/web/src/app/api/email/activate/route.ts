// POST /api/email/activate
//
// Sends an activation email for a freshly-signed-up account. Same-origin
// only — we don't want the rest of the internet using our Mailtrap quota
// to spam arbitrary inboxes.
//
// Body: { email: string }
//
// The activation link goes to /tv/activate?token=<one-time>. The real
// auth backend will verify the token server-side and flip the user to
// activated; until that ships the page already activates any session
// it can identify, so the link still works end-to-end.

import { NextRequest, NextResponse } from 'next/server';
import { sendMail, renderActivationEmail, MailtrapError } from '@/lib/mailtrap';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function allowedCaller(req: NextRequest): boolean {
  const ref = req.headers.get('origin') || req.headers.get('referer') || '';
  if (!ref) return false;
  let refHost: string;
  try { refHost = new URL(ref).host; } catch { return false; }
  if (refHost === (req.headers.get('host') || '')) return true;
  const extra = (process.env.ALLOWED_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return extra.includes(refHost);
}

function originUrl(req: NextRequest): string {
  // Prefer the explicit forwarded protocol / host so links in the email
  // reach the same deploy the user just signed up on (custom domains,
  // per-deploy preview URLs, localhost dev, all handled).
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host  = req.headers.get('x-forwarded-host')  || req.headers.get('host');
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

// Crypto-random token for the activation link. The current frontend
// build doesn't validate it (no auth backend yet) — but the link still
// has a unique token per send so once the backend lands it'll work
// without changing this route.
function freshToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(req: NextRequest) {
  if (!allowedCaller(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  let body: { email?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'invalid email' }, { status: 400 });
  }

  const token  = freshToken();
  const activationUrl = `${originUrl(req)}/tv/activate?token=${token}`;
  const { subject, text, html } = renderActivationEmail({ email, activationUrl });

  try {
    const result = await sendMail({
      to: email, subject, text, html, category: 'activation',
    });
    return NextResponse.json({ ok: true, messageIds: result.messageIds });
  } catch (e) {
    if (e instanceof MailtrapError) {
      // Log the upstream response on the deploy side; the user-facing
      // reply stays generic so we don't expose Mailtrap response bodies
      // (which can mention internal account ids, quota, etc.).
      console.warn('[email/activate]', e.status, e.body.slice(0, 300));
      // 422 = sender domain not verified yet, 401/403 = bad token.
      const userMsg = e.status === 422
        ? 'Email delivery is not yet configured. The account is still active — open it manually from /tv/activate.'
        : 'We could not send the activation email. Please try again or open your account manually.';
      return NextResponse.json({ error: userMsg, status: e.status }, { status: 502 });
    }
    console.warn('[email/activate] unexpected', String(e));
    return NextResponse.json({ error: 'Email send failed.' }, { status: 502 });
  }
}
