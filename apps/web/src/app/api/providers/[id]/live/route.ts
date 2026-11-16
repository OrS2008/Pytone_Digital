// GET /api/providers/:id/live — live channels in the app's channel shape.
//
// Stream URLs point at /api/providers/:id/play/…, which resolves the real
// (credential-bearing) URL server-side; nothing secret is in this payload.

import { NextRequest, NextResponse } from 'next/server';
import { loadOwned, clientFor, errorResponse, cacheable } from '@/lib/providers/http';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await loadOwned(req, id);
  if (owned instanceof Response) return owned;
  try {
    const client = clientFor(owned.record);
    const [categories, channels] = await Promise.all([client.liveCategories(), client.liveChannels()]);
    const catName = new Map(categories.map((c) => [c.id, c.name]));
    const base = `/api/providers/${id}/play`;
    return NextResponse.json({
      categories,
      channels: channels.map((c) => ({
        id: `p.${id}.${c.id}`,
        number: c.number,
        name: c.name,
        logoUrl: c.logo,
        category: catName.get(c.categoryId) || 'Other',
        streamUrl: `${base}/live/${encodeURIComponent(c.id)}.m3u8`,
        tvgId: c.epgId || undefined,
        ...(c.catchupDays > 0 ? {
          catchupKind: 'vod',
          catchupDays: c.catchupDays,
          // expanded client-side by lib/catchup (${utc} seconds, ${duration} minutes)
          catchupSource: `${base}/catchup/${encodeURIComponent(c.id)}/\${utc}/\${duration}.m3u8`,
        } : {}),
      })),
    }, { headers: cacheable });
  } catch (e) { return errorResponse(e); }
}
