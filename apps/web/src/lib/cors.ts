// CORS for the proxy routes. They used to echo back ANY Origin, which
// let any website read proxied responses. Only our own host (and hosts
// listed in ALLOWED_HOSTS, e.g. a TV launcher origin) are reflected.
export function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  if (!origin) return {};
  let host: string;
  try { host = new URL(origin).host; } catch { return {}; }
  const own = req.headers.get('host') || '';
  const extra = (process.env.ALLOWED_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (host !== own && !extra.includes(host)) return {};
  return { 'access-control-allow-origin': origin, vary: 'Origin' };
}
