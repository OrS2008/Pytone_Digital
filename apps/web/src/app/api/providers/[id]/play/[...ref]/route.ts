// GET /api/providers/:id/play/<kind>/<…>
//
//   live/<streamId>.m3u8
//   movie/<vodId>.<ext>
//   episode/<episodeId>.<ext>
//   catchup/<streamId>/<startEpochSec>/<minutes>.m3u8
//
// Resolves the provider's real stream URL server-side (for Stalker that
// means a create_link call), seals it into a user-bound token and
// redirects to /api/stream?t=…  The path keeps a media extension so
// players pick HLS vs progressive correctly before following the
// redirect. Credentials never reach the browser.

import { NextRequest, NextResponse } from 'next/server';
import { loadOwned, clientFor, errorResponse } from '@/lib/providers/http';
import { sealStreamTarget } from '@/lib/streamToken';
import type { PlayRef } from '@/lib/providers';

export const dynamic = 'force-dynamic';

const ID = /^[\w~-]{1,512}$/;

function parseRef(parts: string[]): PlayRef | null {
  const [kind, ...rest] = parts.map((p) => decodeURIComponent(p));
  const splitExt = (s: string) => { const m = /^(.+)\.([a-z0-9]{2,7})$/i.exec(s); return m ? [m[1], m[2].toLowerCase()] : [s, '']; };
  if (kind === 'live' && rest.length === 1) {
    const [id] = splitExt(rest[0]);
    return ID.test(id) ? { kind, id } : null;
  }
  if ((kind === 'movie' || kind === 'episode') && rest.length === 1) {
    const [id, ext] = splitExt(rest[0]);
    return ID.test(id) ? { kind, id, ext: ext || 'mp4' } : null;
  }
  if (kind === 'catchup' && rest.length === 3) {
    const startSec = Number(rest[1]);
    const durationMin = Number(splitExt(rest[2])[0]);
    const now = Date.now() / 1000;
    if (!ID.test(rest[0]) || !Number.isInteger(startSec) || !Number.isFinite(durationMin)) return null;
    if (startSec < now - 30 * 86400 || startSec > now + 3600 || durationMin <= 0 || durationMin > 24 * 60) return null;
    return { kind, id: rest[0], startSec, durationMin };
  }
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; ref: string[] }> }) {
  const { id, ref } = await params;
  const playRef = parseRef(ref ?? []);
  if (!playRef) return NextResponse.json({ error: 'bad_reference' }, { status: 400 });
  // Not rate-limited: a zap is one cheap call. The session gate applies.
  const owned = await loadOwned(req, id, false);
  if (owned instanceof Response) return owned;
  try {
    const target = await clientFor(owned.record).resolve(playRef);
    const token = await sealStreamTarget(target, owned.viewer.userId);
    const location = `/api/stream?t=${encodeURIComponent(token)}`;
    // ?json=1 — for players that must know the container before loading
    // (a Stalker link's type is only known once the portal returns it).
    if (req.nextUrl.searchParams.get('json') === '1') {
      let hls = false;
      try { hls = /\.m3u8$/i.test(new URL(target.url).pathname); } catch { /* keep false */ }
      return NextResponse.json({ url: location, hls }, { headers: { 'cache-control': 'no-store' } });
    }
    return new Response(null, {
      status: 302,
      headers: { location, 'cache-control': 'no-store' },
    });
  } catch (e) { return errorResponse(e); }
}
