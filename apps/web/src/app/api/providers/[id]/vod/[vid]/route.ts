// GET /api/providers/:id/vod/:vid — one movie's details.
import { NextRequest, NextResponse } from 'next/server';
import { loadOwned, clientFor, errorResponse, cacheable } from '@/lib/providers/http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; vid: string }> }) {
  const { id, vid } = await params;
  if (!/^[\w-]{1,32}$/.test(vid)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const owned = await loadOwned(req, id);
  if (owned instanceof Response) return owned;
  try {
    return NextResponse.json({ movie: await clientFor(owned.record).movieDetail(vid) }, { headers: cacheable });
  } catch (e) { return errorResponse(e); }
}
