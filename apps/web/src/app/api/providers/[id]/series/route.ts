// GET /api/providers/:id/series[?category=] — series categories + catalogue.
import { NextRequest, NextResponse } from 'next/server';
import { loadOwned, clientFor, errorResponse, cacheable } from '@/lib/providers/http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await loadOwned(req, id);
  if (owned instanceof Response) return owned;
  if (!owned.record.capabilities.series) return NextResponse.json({ error: 'unsupported', message: 'This provider offers no series.' }, { status: 404 });
  const cat = req.nextUrl.searchParams.get('category') || undefined;
  if (cat && !/^[\w-]{1,32}$/.test(cat)) return NextResponse.json({ error: 'bad_category' }, { status: 400 });
  try {
    const client = clientFor(owned.record);
    const [categories, series] = await Promise.all([client.seriesCategories(), client.series(cat)]);
    return NextResponse.json({ categories, series }, { headers: cacheable });
  } catch (e) { return errorResponse(e); }
}
