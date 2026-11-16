// Structured logging for the edge functions.
//
// One JSON object per line, so Cloudflare's log tail / Logpush can be
// filtered by `event`, `level` or `rid` (request id, set by middleware
// as x-request-id). Secrets never reach the log: URLs lose their query
// string and credential-shaped path segments, and fields whose names
// look sensitive are masked.

const SENSITIVE_FIELD = /pass|secret|token|cookie|authorization|mac|username|credential|key/i;

export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    // Xtream-style /live/<user>/<pass>/… and /timeshift/<user>/<pass>/…
    const path = u.pathname.replace(/^\/(live|movie|series|timeshift|hls)\/[^/]+\/[^/]+\//, '/$1/***/***/');
    return `${u.protocol}//${u.host}${path}${u.search ? '?…' : ''}`;
  } catch {
    return '<invalid url>';
  }
}

function clean(v: unknown, key = ''): unknown {
  if (v === null || v === undefined) return v;
  if (key && SENSITIVE_FIELD.test(key)) return '***';
  if (typeof v === 'string') {
    const s = v.replace(/https?:\/\/[^\s"'<>]+/g, (m) => redactUrl(m));
    return s.length > 500 ? s.slice(0, 500) + '…' : s;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => clean(x));
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = clean(x, k);
    return out;
  }
  return String(v);
}

export type Level = 'info' | 'warn' | 'error';

export function log(level: Level, event: string, fields: Record<string, unknown> = {}, req?: Request): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    rid: req?.headers.get('x-request-id') ?? undefined,
    ...(clean(fields) as Record<string, unknown>),
  };
  const text = JSON.stringify(line);
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else console.info(text);
}

/** Short, non-reversible id for a user in logs (never the email). */
export async function userTag(userId: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('log:' + userId)));
  return Array.from(d.slice(0, 5)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
