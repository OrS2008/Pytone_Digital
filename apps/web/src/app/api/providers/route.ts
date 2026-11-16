// GET  /api/providers           — the caller's provider connections (no secrets)
// POST /api/providers           — add one: { type, name, config }
//
// A connection is only saved after the provider accepts the credentials,
// and only encrypted (see lib/providers/store).

import { NextRequest, NextResponse } from 'next/server';
import { requireViewer } from '@/lib/viewerAuth';
import { normaliseConfig, makeClient } from '@/lib/providers';
import { listProviders, saveProviders, publicView, MAX_PROVIDERS, type ProviderRecord } from '@/lib/providers/store';
import { errorResponse } from '@/lib/providers/http';
import { randomId } from '@/lib/auth/password';
import { isEncryptionConfigured } from '@/lib/secretBox';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const MAX_BODY = 4096;

export async function GET(req: NextRequest) {
  const viewer = await requireViewer(req);
  if (viewer instanceof Response) return viewer;
  try {
    const list = await listProviders(viewer.kv, viewer.userId);
    return NextResponse.json({ providers: list.map(publicView), encryption: isEncryptionConfigured() });
  } catch (e) { return errorResponse(e); }
}

export async function POST(req: NextRequest) {
  const viewer = await requireViewer(req, { limit: { bucket: 'provider_add', max: 10, windowSec: 600 } });
  if (viewer instanceof Response) return viewer;
  if (!isEncryptionConfigured()) return errorResponse(new (await import('@/lib/secretBox')).EncryptionNotConfiguredError());

  const text = await req.text();
  if (text.length > MAX_BODY) return NextResponse.json({ error: 'too_large' }, { status: 413 });
  let body: { type?: unknown; name?: unknown; config?: unknown };
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'bad_json' }, { status: 400 });

  try {
    const { type, config } = normaliseConfig(body.type, body.config);
    const name = (typeof body.name === 'string' ? body.name.trim() : '').slice(0, 60) || (type === 'xtream' ? 'Xtream Codes' : 'Stalker portal');
    const existing = await listProviders(viewer.kv, viewer.userId);
    if (existing.length >= MAX_PROVIDERS) return NextResponse.json({ error: 'too_many', max: MAX_PROVIDERS }, { status: 409 });

    const client = makeClient(type, config);
    const account = await client.login();            // throws on bad credentials
    const capabilities = await client.capabilities();
    const now = Date.now();
    const record: ProviderRecord = {
      id: randomId().replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 16).padEnd(16, '0'),
      type, name, createdAt: now, config, capabilities, account, checkedAt: now,
    };
    await saveProviders(viewer.kv, viewer.userId, [...existing, record]);
    console.info('[providers] added', { type, userId: viewer.userId.slice(0, 6) });
    return NextResponse.json({ provider: publicView(record) }, { status: 201 });
  } catch (e) { return errorResponse(e); }
}
