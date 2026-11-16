// GET /api/providers/:id/series/:sid — seasons and episodes.
import { NextRequest, NextResponse } from 'next/server';
import { loadOwned, clientFor, errorResponse, cacheable } from '@/lib/providers/http';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = await params;
  if (!/^[\w-]{1,32}$/.test(sid)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const owned = await loadOwned(req, id);
  if (owned instanceof Response) return owned;
  try {
    return NextResponse.json(await clientFor(owned.record).seriesDetail(sid), { headers: cacheable });
  } catch (e) { return errorResponse(e); }
}
