// Shared plumbing for the /api/providers routes.

import { NextResponse } from 'next/server';
import { requireViewer, type Viewer } from '../viewerAuth';
import { EncryptionNotConfiguredError } from '../secretBox';
import { ProviderError } from './types';
import { getProvider, type ProviderRecord } from './store';
import { makeClient } from './index';

export const PROVIDER_LIMIT = { bucket: 'provider_api', max: 120, windowSec: 300 };

export function errorResponse(e: unknown): Response {
  if (e instanceof EncryptionNotConfiguredError) {
    return NextResponse.json({ error: 'encryption_not_configured', message: 'Provider connections need NOVA_ENCRYPTION_KEY set on the server.' }, { status: 503 });
  }
  if (e instanceof ProviderError) {
    const status = { invalid_config: 400, auth_failed: 422, account_inactive: 422, unreachable: 502, bad_response: 502, unsupported: 404 }[e.code];
    // ProviderError messages are written for users and never contain credentials.
    return NextResponse.json({ error: e.code, message: e.message }, { status });
  }
  console.error('[providers] unexpected error', (e as Error)?.name, (e as Error)?.message?.replace(/https?:\/\/\S+/g, '<url>'));
  return NextResponse.json({ error: 'internal_error' }, { status: 500 });
}

/** Auth + load the caller's provider by id (404 for someone else's id). */
export async function loadOwned(req: Request, id: string, limit = true): Promise<{ viewer: Viewer; record: ProviderRecord } | Response> {
  const viewer = await requireViewer(req, limit ? { limit: PROVIDER_LIMIT } : {});
  if (viewer instanceof Response) return viewer;
  if (!/^[a-z0-9]{8,32}$/.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  try {
    const record = await getProvider(viewer.kv, viewer.userId, id);
    if (!record) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return { viewer, record };
  } catch (e) {
    return errorResponse(e);
  }
}

export const clientFor = (r: ProviderRecord) => makeClient(r.type, r.config);

export const cacheable = { 'cache-control': 'private, max-age=300' };
