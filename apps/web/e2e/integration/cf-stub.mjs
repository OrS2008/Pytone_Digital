// Stand-in for @opennextjs/cloudflare in Node: getCloudflareContext()
// returns whatever env the current test installed.
export function getCloudflareContext() {
  if (!globalThis.__novaTestEnv) throw new Error('no request context');
  return { env: globalThis.__novaTestEnv, ctx: { waitUntil() {} }, cf: {} };
}
