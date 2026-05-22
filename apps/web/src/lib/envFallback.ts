// Robust env-var lookup with .env file fallback.
//
// Why this exists: Next.js's .env loader treats `$` in values as
// variable expansion. A scrypt hash like "scrypt$<saltHex>$<hashHex>"
// gets silently truncated to literally "scrypt" because the
// hex-after-$ chunks expand to undefined variables. Operators who
// don't know to single-quote the value end up locked out of admin.
//
// In dev (and any deploy where the env file is on disk next to the
// app) we read .env.local / .env.development.local / .env directly
// and use that value as a fallback whenever process.env contains
// either nothing or a value that looks mangled.
//
// In Netlify / Vercel / etc. production deploys, env vars are set
// in the host dashboard and process.env carries the raw value
// untouched — the fallback is a no-op there.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_FILES = ['.env.local', '.env.development.local', '.env'];

let cachedFileEnv: Record<string, string> | null | undefined;

function readFileEnv(): Record<string, string> {
  if (cachedFileEnv !== undefined) return cachedFileEnv || {};
  try {
    const out: Record<string, string> = {};
    for (const f of ENV_FILES) {
      const full = resolve(process.cwd(), f);
      if (!existsSync(full)) continue;
      const text = readFileSync(full, 'utf8');
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq < 0) continue;
        const k = line.slice(0, eq).trim();
        let v = line.slice(eq + 1).trim();
        // Strip surrounding quotes so 'foo' and "foo" both yield foo.
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        // First-write-wins, so an operator's .env.local can shadow a
        // committed .env baseline (matches Next's own precedence).
        if (!(k in out)) out[k] = v;
      }
    }
    cachedFileEnv = out;
    return out;
  } catch {
    cachedFileEnv = null;
    return {};
  }
}

// Heuristics for "looks like dotenv ate this value". A scrypt hash
// always has at least two separators ($ or :); if we see "scrypt"
// with nothing after, the value was mangled.
function looksMangled(name: string, value: string | undefined): boolean {
  if (!value) return true;
  if (name === 'ADMIN_PASSWORD_HASH') {
    return value === 'scrypt' || (!value.includes('$') && !value.includes(':'));
  }
  return false;
}

export function getEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (!looksMangled(name, raw)) return raw;
  const fromFile = readFileEnv()[name];
  if (fromFile && !looksMangled(name, fromFile)) return fromFile;
  return raw; // give up, return whatever process.env had
}
