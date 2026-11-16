// Stand-in for @cloudflare/next-on-pages in Node: getRequestContext()
// returns whatever env the current test installed.
export function getRequestContext() {
  if (!globalThis.__novaTestEnv) throw new Error('no request context');
  return { env: globalThis.__novaTestEnv, ctx: { waitUntil() {} }, cf: {} };
}
