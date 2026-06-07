// Transactional email via Brevo's HTTP "Transactional Email" API.
//
// Why HTTP and not SMTP: Cloudflare Workers can't open arbitrary TCP
// connections, so SMTP from the edge is a non-starter. Brevo exposes
// the same delivery pipeline behind a JSON-over-HTTPS endpoint that
// works straight from a fetch() inside a Worker.
//
// Endpoint: POST https://api.brevo.com/v3/smtp/email
//   Headers: api-key, content-type: application/json
//   Body:    { sender:{email,name}, to:[{email,name?}], subject,
//              htmlContent, textContent, tags? }
//   Success: 201 { messageId }
//   Failure: 400 / 401 / 402 / 403 / 404 / 5xx with { code, message }
//
// Configuration is via env vars only. Nothing here is hard-coded so
// rotating the key is "set the new value in the Cloudflare dashboard,
// redeploy isn't even strictly required (process.env is read per
// request)".
//
// Required env vars (all read lazily at request time):
//   BREVO_API_KEY   — xkeysib-... (mandatory; Secret in Cloudflare)
//   BREVO_FROM_EMAIL — sender address; MUST be a verified sender in
//                      the Brevo dashboard or Brevo returns 400.
//                      Defaults to noreply@novastream.tv.
//   BREVO_FROM_NAME  — sender display name; defaults to "Nova Stream".
//
// If BREVO_API_KEY is missing we throw BrevoNotConfiguredError. Callers
// either treat that as a 503 (signup activation) or swallow it
// silently and still return 200 (forgot-password — we don't want to
// leak whether delivery failed to a curious attacker).

export interface EmailMessage {
  to:        string;
  subject:   string;
  text:      string;
  html:      string;
  /** Tag(s) attached to the message in Brevo for filtering / metrics. */
  category?: string;
  /** Per-message overrides for the sender (rare). */
  fromEmail?: string;
  fromName?:  string;
}

export interface EmailResult {
  ok:        true;
  messageId: string | null;
}

export class BrevoNotConfiguredError extends Error {
  constructor() { super('BREVO_API_KEY is not set in the deploy environment.'); }
}

export class BrevoError extends Error {
  status: number;
  body:   string;
  constructor(status: number, body: string) {
    super(`Brevo returned ${status}: ${body.slice(0, 200)}`);
    this.status = status;
    this.body   = body;
  }
}

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

function envOrEmpty(name: string): string {
  if (typeof process === 'undefined' || !process.env) return '';
  return (process.env[name] || '').trim();
}

function getApiKey(): string {
  const key = envOrEmpty('BREVO_API_KEY');
  if (!key) throw new BrevoNotConfiguredError();
  return key;
}

function getFrom(msg: EmailMessage): { email: string; name: string } {
  return {
    email: msg.fromEmail || envOrEmpty('BREVO_FROM_EMAIL') || 'noreply@novastream.tv',
    name:  msg.fromName  || envOrEmpty('BREVO_FROM_NAME')  || 'Nova Stream',
  };
}

export async function sendMail(msg: EmailMessage): Promise<EmailResult> {
  const apiKey = getApiKey();
  const sender = getFrom(msg);

  const body = {
    sender,
    to:           [{ email: msg.to }],
    subject:      msg.subject,
    htmlContent:  msg.html,
    textContent:  msg.text,
    ...(msg.category ? { tags: [msg.category] } : {}),
  };

  const resp = await fetch(BREVO_URL, {
    method: 'POST',
    headers: {
      'api-key':       apiKey,
      'content-type':  'application/json',
      'accept':        'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new BrevoError(resp.status, text);
  }
  let parsed: { messageId?: string } = {};
  try { parsed = JSON.parse(text); } catch { /* keep empty */ }
  return { ok: true, messageId: parsed.messageId ?? null };
}

// Activation email content. Kept here so the wording can iterate
// without touching the transport.
export function renderActivationEmail(args: {
  email:         string;
  activationUrl: string;
}): { subject: string; text: string; html: string } {
  const subject = 'Confirm your Nova Stream account';
  const text = [
    `Welcome to Nova Stream.`,
    ``,
    `Click the link below to verify ${args.email} and start your 7-day free trial:`,
    ``,
    `  ${args.activationUrl}`,
    ``,
    `If you didn't sign up, you can safely ignore this email — the link expires in 24 hours.`,
    ``,
    `— The Nova Stream team`,
  ].join('\n');
  const html = `<!doctype html>
<html><body style="font-family: -apple-system, Segoe UI, Arial, sans-serif; background: #06070A; color: #E9EBF1; padding: 24px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 520px; margin: 0 auto;">
    <tr><td style="padding: 32px 0; text-align: center; color: #FF3B6E; font-weight: 800; letter-spacing: 4px;">NOVA STREAM</td></tr>
    <tr><td style="background: #11141B; border-radius: 16px; padding: 36px 32px;">
      <h1 style="margin: 0 0 12px; font-size: 24px; color: #E9EBF1;">Confirm your account</h1>
      <p style="margin: 0 0 24px; color: #B7BEC9; line-height: 1.55;">
        Click the button below to verify <strong style="color:#E9EBF1">${escapeHtml(args.email)}</strong> and start your 7-day free trial.
        No card needed — cancel any time.
      </p>
      <p style="margin: 0 0 24px; text-align: center;">
        <a href="${args.activationUrl}" style="display: inline-block; padding: 14px 28px; background: #FF3B6E; color: #fff; text-decoration: none; border-radius: 10px; font-weight: 700;">Activate my account</a>
      </p>
      <p style="margin: 0; color: #6F7785; font-size: 12px; line-height: 1.55;">
        Or copy this link into your browser:<br>
        <span style="word-break: break-all; color: #B7BEC9;">${escapeHtml(args.activationUrl)}</span>
      </p>
    </td></tr>
    <tr><td style="padding: 24px 0; text-align: center; color: #6F7785; font-size: 12px;">
      If you didn't sign up, ignore this email — the link expires in 24 hours.
    </td></tr>
  </table>
</body></html>`;
  return { subject, text, html };
}

export function renderResetEmail(args: {
  email:    string;
  resetUrl: string;
}): { subject: string; text: string; html: string } {
  const subject = 'Reset your Nova Stream password';
  const text = [
    `A password reset was requested for ${args.email} on Nova Stream.`,
    ``,
    `If this was you, click the link below to set a new password. The`,
    `link is valid for 30 minutes:`,
    ``,
    `  ${args.resetUrl}`,
    ``,
    `If you didn't request this, you can safely ignore this email —`,
    `nothing about your account will change.`,
    ``,
    `— The Nova Stream team`,
  ].join('\n');
  const html = `<!doctype html>
<html><body style="font-family: -apple-system, Segoe UI, Arial, sans-serif; background: #06070A; color: #E9EBF1; padding: 24px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 520px; margin: 0 auto;">
    <tr><td style="padding: 32px 0; text-align: center; color: #FF3B6E; font-weight: 800; letter-spacing: 4px;">NOVA STREAM</td></tr>
    <tr><td style="background: #11141B; border-radius: 16px; padding: 36px 32px;">
      <h1 style="margin: 0 0 12px; font-size: 24px; color: #E9EBF1;">Reset your password</h1>
      <p style="margin: 0 0 24px; color: #B7BEC9; line-height: 1.55;">
        Someone (hopefully you) asked to reset the password on
        <strong style="color:#E9EBF1">${escapeHtml(args.email)}</strong>.
      </p>
      <p style="margin: 0 0 24px; text-align: center;">
        <a href="${args.resetUrl}" style="display: inline-block; padding: 14px 28px; background: #FF3B6E; color: #fff; text-decoration: none; border-radius: 10px; font-weight: 700;">Set a new password</a>
      </p>
      <p style="margin: 0 0 12px; color: #6F7785; font-size: 12px; line-height: 1.55;">
        Or copy this link into your browser:<br>
        <span style="word-break: break-all; color: #B7BEC9;">${escapeHtml(args.resetUrl)}</span>
      </p>
      <p style="margin: 0; color: #6F7785; font-size: 12px; line-height: 1.55;">
        The link expires in 30 minutes. If you didn't request a reset,
        ignore this email — nothing changes.
      </p>
    </td></tr>
  </table>
</body></html>`;
  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}
