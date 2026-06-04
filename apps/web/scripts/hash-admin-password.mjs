#!/usr/bin/env node
// Generates an ADMIN_PASSWORD_HASH for the edge-runtime admin login.
//
// Output format: pbkdf2:<iterations>:<saltHex>:<hashHex>
//
// Verified by apps/web/src/app/api/admin/login/route.ts using
// Web Crypto's SubtleCrypto.deriveBits(PBKDF2-SHA256).
//
// Usage:
//   node apps/web/scripts/hash-admin-password.mjs              # prompts
//   node apps/web/scripts/hash-admin-password.mjs <password>   # one-shot

import { webcrypto } from 'node:crypto';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

// Cloudflare Workers refuses PBKDF2 above 100 000 iterations. Keep
// this in sync with apps/web/src/lib/auth/password.ts (user-side hash)
// and apps/web/src/app/api/admin/login/route.ts (admin verify path).
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

function bytesToHex(b) {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

async function pbkdf2(password, salt, iterations, lengthBytes) {
  const key = await webcrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await webcrypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    lengthBytes * 8,
  );
  return new Uint8Array(bits);
}

async function main() {
  let password = process.argv[2];
  if (!password) {
    const rl = createInterface({ input, output });
    password = await rl.question('Admin password: ');
    rl.close();
  }
  if (!password) {
    console.error('Password required.');
    process.exit(1);
  }

  const salt = webcrypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt, ITERATIONS, HASH_BYTES);

  const adminHash = `pbkdf2:${ITERATIONS}:${bytesToHex(salt)}:${bytesToHex(hash)}`;
  const sessionSecret = bytesToHex(webcrypto.getRandomValues(new Uint8Array(32)));

  console.log('');
  console.log('Add these to your Cloudflare Pages env (Production + Preview):');
  console.log('');
  console.log(`ADMIN_PASSWORD_HASH=${adminHash}`);
  console.log(`ADMIN_SESSION_SECRET=${sessionSecret}`);
  console.log('');
  console.log('And don\'t forget ADMIN_USERNAME (e.g. admin@novastream.tv).');
}

main().catch((e) => { console.error(e); process.exit(1); });
