# Migration to OpenNext (Cloudflare Workers)

**Branch:** `claude/opennext-migration` · **Date:** 16 November 2026 · Production (`claude/nextgen-iptv-platform-rEZiD` on Cloudflare Pages) is **unchanged** until you complete the steps below.

## Why
`@cloudflare/next-on-pages` is deprecated. Next.js security fixes can outrun its supported range (it already needed a peer-range override for 15.5.29). OpenNext for Cloudflare is the supported adapter and runs the app as a Cloudflare **Worker**.

## What changed in the code
| Change | Detail |
|---|---|
| Adapter | `@cloudflare/next-on-pages` removed; `@opennextjs/cloudflare` 1.20.14 + `wrangler` 4.155.0 (dev dependencies — build tools, not shipped) |
| Runtime | `export const runtime = 'edge'` removed from 50 routes (OpenNext runs the Node.js runtime on Workers with `nodejs_compat`). Middleware unchanged. |
| Bindings | `lib/cfEnv.ts` uses `getCloudflareContext()`; same `NOVA_KV` binding and id |
| Config | `wrangler.toml` is now a Worker config (`main`, `[assets]`, self-reference service, observability); same `[vars]` and KV; adds `global_fetch_strictly_public` (platform-level SSRF backstop) · `open-next.config.ts` |
| Scripts | `npm run build:cf` · `npm run preview:cf` (local Worker) · `npm run deploy:cf` |
| Fix | Stripe return URLs now use `PUBLIC_BASE_URL` (previously fell back to `CF_PAGES_URL`, which does not exist on Workers — checkout would have failed after the move; on Pages it also pointed at per-deployment preview URLs) |
| CI | `ci.yml` builds the Worker bundle instead of the Pages bundle · new **manual** `deploy-worker.yml` |

## Verified (this branch)
| Check | Result |
|---|---|
| `npm ci`, type-check, lint, `next build`, `opennextjs-cloudflare build` | PASS |
| `npm audit --omit=dev` | 0 vulnerabilities (the adapter's own tooling has glob/minimatch advisories; it is a build-time dev dependency and its CLI paths are not used) |
| Worker run locally (`wrangler dev`, workerd, local KV) | PASS — health, Hebrew SSR, signed-in `/api/auth/me` from a KV session, anonymous stream 401, SSRF 400, settings written **encrypted** (`nsb1.`) to KV and read back, providers API, static assets |
| Full browser suite against the local Worker | **39 / 39 PASS** |
| Unit / API integration suites | 6 / 6 · 48 / 48 PASS |
| Deploy to your Cloudflare account | **NOT DONE** — needs your account (steps below) |

## Cut-over steps (owner, ~30 minutes)

1. **API token** — Cloudflare dashboard → My Profile → API Tokens → *Create Token* → template **Edit Cloudflare Workers** → your account. Copy the token and your **Account ID** (Workers & Pages overview, right column).
2. **GitHub secrets** — repository → Settings → Secrets and variables → Actions: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
3. **Worker secrets** — once, from a computer with the repo (`cd apps/web`, `npx wrangler login`), copy the same values you have in Pages:
   ```bash
   npx wrangler secret put NOVA_ENCRYPTION_KEY
   npx wrangler secret put ADMIN_PASSWORD_HASH
   npx wrangler secret put ADMIN_SESSION_SECRET
   npx wrangler secret put STRIPE_SECRET_KEY
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   ```
   Plus, if you use them: `STRIPE_PRICE_SINGLE_MONTHLY`, `STRIPE_PRICE_SINGLE_YEARLY`, `STRIPE_PRICE_MULTI_MONTHLY`, `STRIPE_PRICE_MULTI_YEARLY`, `GOOGLE_CLIENT_ID`, `ALLOWED_HOSTS`, `NOVA_ENCRYPTION_KEY_PREVIOUS`.
   **`NOVA_ENCRYPTION_KEY` must be identical** to the Pages one, or existing encrypted settings and provider connections cannot be read.
4. **Deploy** — GitHub → Actions → *deploy-worker* → *Run workflow* → branch `claude/opennext-migration`. The Worker appears as `nova-stream.<your-subdomain>.workers.dev`.
5. **Test on the Worker URL** — `/api/health` shows `"storage":"ok"`; sign in; play a channel; open account settings (your data must be there — same KV).
6. **Switch traffic** — either add your custom domain to the Worker (Worker → Settings → Domains & Routes), or keep `pages.dev`: the Android app loads `https://nova-stream-cce.pages.dev/tv/home`, so moving off that address needs a new APK with the new URL (`apps/android/capacitor.config.ts`) **or** a redirect left on Pages. Then set `PUBLIC_BASE_URL` in `wrangler.toml` to the new address, update the Stripe webhook endpoint URL, and add the new domain to Firebase → Authentication → Authorized domains.
7. **Merge** — once happy, tell me to merge `claude/opennext-migration` into the production branch (and disable the Pages project's automatic builds).

## Rollback
Until step 6, nothing user-facing changes. After it, point the domain back to Pages (or reinstate the old route); both read the same KV, so no data is lost either way.

## Note on Pages preview builds
Pushing this branch triggers a Cloudflare **Pages preview** build, which fails because its build command still calls `next-on-pages`. This does not affect production.
