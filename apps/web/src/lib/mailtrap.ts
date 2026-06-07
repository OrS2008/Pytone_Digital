// Mailtrap email-sending helper.
//
// Mailtrap offers two HTTP APIs that share the same auth shape:
//   - Production "Send"  → https://send.api.mailtrap.io/api/send
//   - Sandbox / Testing  → https://sandbox.api.mailtrap.io/api/send/<inboxId>
//
// We default to the production Send API. Operators can flip to the
// sandbox by setting:
//   MAILTRAP_API_URL = https://sandbox.api.mailtrap.io/api/send/<inboxId>
//
// Authentication is a Bearer token. We read it from process.env at request
// time (NOT at module load) so a Cloudflare secret rotation takes effect
// without a redeploy. The DEFAULT_TOKEN fallback exists so a fresh clone
// of the repo runs out of the box — for production you should set the
// MAILTRAP_API_TOKEN secret via the Cloudflare Pages dashboard instead.

// Default sender. Mailtrap's Send API requires the from-domain to be
// verified in the account; you'll see a 422 if it isn't. The sandbox
// API accepts anything.
const DEFAULT_FROM_EMAIL = 'noreply@novastream.tv';
const DEFAULT_FROM_NAME  = 'Nova Stream';

// Falls back to a hard-coded token when the env var is missing so a
// fresh clone still sends real mail. Rotate by setting the secret in
// Cloudflare's dashboard and deleting this string.
const DEFAULT_TOKEN = '2b855ef6ce86a1b1ed07d56706b7b925';

const DEFAULT_API_URL = 'https://send.api.mailtrap.io/api/send';

export interface MailtrapMessage {
  to:       string;
  subject:  string;
  text:     string;
  html:     string;
  category?: string;
  /** Per-message overrides. */
  fromEmail?: string;
  fromName?:  string;
}

export interface MailtrapResult {
  ok: true;
  messageIds: string[];
}

export class MailtrapError extends Error {
  status: number;
  body:   string;
  constructor(status: number, body: string) {
    super(`Mailtrap returned ${status}: ${body.slice(0, 200)}`);
    this.status = status;
    this.body   = body;
  }
}

function getToken(): string {
  const env = (typeof process !== 'undefined' && process.env)
    ? (process.env.MAILTRAP_API_TOKEN || '').trim()
    : '';
  return env || DEFAULT_TOKEN;
}

function getApiUrl(): string {
  const env = (typeof process !== 'undefined' && process.env)
    ? (process.env.MAILTRAP_API_URL || '').trim()
    : '';
  return env || DEFAULT_API_URL;
}

function getFrom(msg: MailtrapMessage): { email: string; name: string } {
  const envEmail = (typeof process !== 'undefined' && process.env?.MAILTRAP_FROM_EMAIL) || '';
  const envName  = (typeof process !== 'undefined' && process.env?.MAILTRAP_FROM_NAME)  || '';
  return {
    email: msg.fromEmail || envEmail || DEFAULT_FROM_EMAIL,
    name:  msg.fromName  || envName  || DEFAULT_FROM_NAME,
  };
}

export async function sendMail(msg: MailtrapMessage): Promise<MailtrapResult> {
  const token = getToken();
  if (!token) throw new MailtrapError(0, 'MAILTRAP_API_TOKEN is not configured');

  const from = getFrom(msg);
  const body = {
    from,
    to:      [{ email: msg.to }],
    subject: msg.subject,
    text:    msg.text,
    html:    msg.html,
    ...(msg.category ? { category: msg.category } : {}),
  };

  const resp = await fetch(getApiUrl(), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new MailtrapError(resp.status, text);
  }
  let parsed: { success?: boolean; message_ids?: string[] } = {};
  try { parsed = JSON.parse(text); } catch { /* keep empty */ }
  return { ok: true, messageIds: parsed.message_ids ?? [] };
}

// Activation email content. Kept separate from sendMail so the wording
// can iterate without touching the transport.
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
