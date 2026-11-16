// Access Cloudflare bindings (KV namespaces) from route handlers.
// Built on @opennextjs/cloudflare's getCloudflareContext (the app runs
// as a Cloudflare Worker through the OpenNext adapter).
//
// All KV access in the API routes flows through here so a single
// "binding missing" check applies everywhere — the user sees one clear
// 503 message instead of cryptic null-deref crashes when they haven't
// finished wiring up the NOVA_KV binding in the Cloudflare dashboard.

import { getCloudflareContext } from '@opennextjs/cloudflare';

// The KV interface we use is a small subset of the full Workers KV API.
// Defining it here lets us mock the binding in tests and keeps the rest
// of the codebase decoupled from @cloudflare/workers-types.
export interface KVNamespace {
  get(key: string, options?: { type?: 'text' | 'json' }): Promise<string | null>;
  getWithMetadata?<T>(key: string): Promise<{ value: string | null; metadata: T | null }>;
  put(key: string, value: string, options?: { expirationTtl?: number; expiration?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list?(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
}

interface NovaEnv {
  NOVA_KV?: KVNamespace;
}

// Returns the bound NOVA_KV namespace, or null if it hasn't been
// configured yet. API handlers use this null check to surface a
// helpful 503 rather than crashing with "cannot read .put of undefined".
export function getKV(): KVNamespace | null {
  try {
    const ctx = getCloudflareContext();
    const env = ctx.env as unknown as NovaEnv;
    return env.NOVA_KV ?? null;
  } catch {
    // getCloudflareContext throws when called outside the Worker
    // (e.g. during `next build`, or under plain `next start`). Treat as
    // "no binding" — the consumer returns 503 at runtime.
    return null;
  }
}

// One-stop helper for routes that can't do anything without KV.
// Returns a 503 Response when the binding is missing so the user
// sees an actionable message instead of a 500 stack trace.
export function requireKV(): KVNamespace | Response {
  const kv = getKV();
  if (!kv) {
    return new Response(
      JSON.stringify({
        error: 'storage_unconfigured',
        message:
          'Server storage is not configured yet. Bind a Cloudflare KV ' +
          'namespace named NOVA_KV (wrangler.toml → kv_namespaces), ' +
          'then redeploy.',
      }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    );
  }
  return kv;
}
