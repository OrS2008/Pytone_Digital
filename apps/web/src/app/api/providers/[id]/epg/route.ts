// GET /api/providers/:id/epg — the provider's XMLTV guide, streamed through.
// The upstream URL carries credentials, so the browser asks by provider id.

import { NextRequest, NextResponse } from 'next/server';
import { loadOwned, clientFor, errorResponse } from '@/lib/providers/http';
import { safeFetch, SsrfBlocked } from '@/lib/ssrfGuard';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 96 * 1024 * 1024;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await loadOwned(req, id);
  if (owned instanceof Response) return owned;
  const client = clientFor(owned.record);
  const url = client.epgUrl();
  if (!url) {
    // No XMLTV URL: build the guide from the provider's own API (Stalker).
    if (!client.epgXml) return NextResponse.json({ error: 'unsupported', message: 'This provider has no programme guide.' }, { status: 404 });
    try {
      const body = await client.epgXml(24);
      return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'private, max-age=900' } });
    } catch (e) { return errorResponse(e); }
  }
  let upstream: Response;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 30_000);
    try { upstream = (await safeFetch(url, { headers: {} }, { maxRedirects: 4, signal: ac.signal })).response; }
    finally { clearTimeout(t); }
  } catch (e) {
    if (e instanceof SsrfBlocked) return NextResponse.json({ error: 'refused' }, { status: 400 });
    return errorResponse(e);
  }
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: 'upstream', status: upstream.status }, { status: 502 });
  let total = 0;
  const reader = upstream.body.getReader();
  const body = new ReadableStream({
    async pull(c) {
      const { done, value } = await reader.read();
      if (done) return c.close();
      total += value.byteLength;
      if (total > MAX_BYTES) return c.error(new Error('guide too large'));
      c.enqueue(value);
    },
    cancel() { reader.cancel(); },
  });
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'private, max-age=900' } });
}
