// Node module hooks so the integration tests can import the real
// route handlers from src/ without a build:
//   '@/x'          → src/x.ts (tsconfig path alias)
//   './x' (no ext) → ./x.ts or ./x/index.ts
//   '@cloudflare/next-on-pages' → a stub whose getRequestContext()
//                                 returns the in-memory env the test set.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const SRC = path.resolve(fileURLToPath(new URL('../../src/', import.meta.url)));
const STUB = pathToFileURL(fileURLToPath(new URL('./cf-stub.mjs', import.meta.url))).href;

function tsFile(base) {
  for (const c of [base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) if (existsSync(c)) return c;
  return null;
}

export async function resolve(spec, ctx, next) {
  if (spec === '@cloudflare/next-on-pages') return { url: STUB, shortCircuit: true };
  if (spec.startsWith('@/')) {
    const f = tsFile(path.join(SRC, spec.slice(2)));
    if (f) return { url: pathToFileURL(f).href, shortCircuit: true };
  }
  if ((spec.startsWith('./') || spec.startsWith('../')) && ctx.parentURL?.startsWith('file:') && !path.extname(spec)) {
    const f = tsFile(path.resolve(path.dirname(fileURLToPath(ctx.parentURL)), spec));
    if (f) return { url: pathToFileURL(f).href, shortCircuit: true };
  }
  if (spec === 'next/server') return next('next/server.js', ctx);
  return next(spec, ctx);
}
