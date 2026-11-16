// GET  /api/settings — return the signed-in user's settings blob
// PUT  /api/settings — overwrite the blob with the request body
//
// Body shape: an opaque JSON object of localStorage entries the client
// chooses to sync. The server doesn't introspect it beyond enforcing a
// size cap; the client picks which userKey()'d keys to ship. This
// keeps the schema flexible so adding a new preference page doesn't
// require a server change.
//
// Size cap: 256 KiB. Cloudflare KV's per-value limit is 25 MiB, but
// we shouldn't be writing megabyte blobs on every preference toggle.
// Channel cache and EPG data live elsewhere (sessionStorage / IndexedDB
// in the browser) — settings are URLs + flags only.
//
// Access gate: GET stays open to any signed-in user so they can still
// pull their settings down after their trial ends (the data is theirs;
// they don't lose it). PUT requires an active trial / subscription so
// expired accounts can't keep mutating server state without paying.

import { NextRequest, NextResponse } from 'next/server';
import { readSettingsText, writeSettingsText } from '@/lib/settingsStore';
import { requireKV } from '@/lib/cfEnv';
import { requireActiveAccess } from '@/lib/accessGuard';
import { readSession, readSessionCookie } from '@/lib/auth/serverSession';

export const dynamic = 'force-dynamic';

const MAX_BLOB_BYTES = 256 * 1024;

function settingsKey(userId: string): string { return `settings:${userId}`; }

export async function GET(req: NextRequest) {
  const kv = requireKV();
  if (kv instanceof Response) return kv;
  const sid = readSessionCookie(req);
  const session = sid ? await readSession(kv, sid) : null;
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let raw: string | null;
  try {
    raw = await readSettingsText(kv, session.userId);
  } catch {
    return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 });
  }
  if (raw === null && (await kv.get(settingsKey(session.userId))) !== null) {
    // A blob exists but cannot be decrypted (key missing or rotated out).
    // Never answer "empty" here: the client would treat that as "nothing
    // saved" and overwrite the real data on its next sync.
    return NextResponse.json({ error: 'settings_unreadable' }, { status: 503 });
  }
  if (!raw) return NextResponse.json({ settings: {} }, { status: 200 });
  try {
    const parsed = JSON.parse(raw);
    return NextResponse.json({ settings: parsed }, { status: 200 });
  } catch {
    return NextResponse.json({ settings: {} }, { status: 200 });
  }
}

export async function PUT(req: NextRequest) {
  const guard = await requireActiveAccess(req);
  if (guard instanceof Response) return guard;
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > MAX_BLOB_BYTES) {
    return NextResponse.json({ error: 'too_large', maxBytes: MAX_BLOB_BYTES }, { status: 413 });
  }
  const text = await req.text();
  if (text.length > MAX_BLOB_BYTES) {
    return NextResponse.json({ error: 'too_large', maxBytes: MAX_BLOB_BYTES }, { status: 413 });
  }
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return NextResponse.json({ error: 'bad_shape', detail: 'settings must be a JSON object' }, { status: 400 });
  }
  const { encrypted } = await writeSettingsText(guard.kv, guard.session.userId, text);
  return NextResponse.json({ ok: true, encrypted }, { status: 200 });
}
