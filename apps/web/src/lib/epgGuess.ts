// Heuristic generator for "what URL might serve this provider's
// XMLTV EPG?" Most IPTV providers don't ship the url-tvg attribute
// on their #EXTM3U header (even when they DO host an EPG), so the
// player can't auto-discover. Given the M3U URL, this returns a
// short list of likely-correct EPG URLs that the catchup page can
// test against /api/epg.
//
// The patterns codified here are the ones used by the major IPTV
// panel software (Xtream Codes / XUI.one / Stalker / Flussonic-
// front-ends) and the resellers built on top of them. They are
// SAFE guesses — at worst the server returns 404 / non-XML and we
// move on. We never apply a guess automatically; the user picks
// from the tested-OK list.
//
// Caller pattern:
//   const candidates = guessEpgUrls('https://provider/playlist/abc.m3u8');
//   for (const c of candidates) {
//     const r = await fetch('/api/epg?url=' + encodeURIComponent(c));
//     if (r.ok) ...
//   }

export function guessEpgUrls(m3uUrl: string): string[] {
  if (!m3uUrl) return [];
  let u: URL;
  try { u = new URL(m3uUrl); } catch { return []; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return [];

  const out = new Set<string>();
  const origin = u.origin;
  const path = u.pathname;
  const search = u.search;

  // 1. Same path with .m3u8 → .xml.gz / .xml.
  //    play-berry.net/playlist/<token>.m3u8 → /playlist/<token>.xml.gz
  if (/\.m3u8?$/i.test(path)) {
    const noExt = path.replace(/\.m3u8?$/i, '');
    out.add(`${origin}${noExt}.xml.gz${search}`);
    out.add(`${origin}${noExt}.xml${search}`);
  }

  // 2. /playlist/ → /xmltv/ swap with same suffix variants.
  if (/\/playlist\//i.test(path)) {
    const noExt = path.replace(/\.m3u8?$/i, '').replace(/\/playlist\//i, '/xmltv/');
    out.add(`${origin}${noExt}.xml.gz${search}`);
    out.add(`${origin}${noExt}.xml${search}`);
  }

  // 3. Xtream-style get.php with type=m3u_plus → xmltv.php with same
  //    username + password. This is the standard Xtream Codes path.
  if (/\/get\.php$/i.test(path)) {
    const params = new URLSearchParams(u.search);
    const u2 = new URL(`${origin}/xmltv.php`);
    const user = params.get('username');
    const pass = params.get('password');
    if (user && pass) {
      u2.searchParams.set('username', user);
      u2.searchParams.set('password', pass);
      out.add(u2.toString());
    }
  }

  // 4. Same URL with ?type=xmltv appended (a small number of panels
  //    serve EPG from the same endpoint with a different ?type).
  if (/get\.php/i.test(path)) {
    const u2 = new URL(u);
    u2.searchParams.set('type', 'xmltv');
    out.add(u2.toString());
  }

  // 5. /api/get/m3u → /api/get/epg (used by some MX-Player / panel
  //    flavours).
  if (/\/m3u(?:\?|$)/i.test(path)) {
    out.add(`${origin}${path.replace(/\/m3u/i, '/epg')}${search}`);
  }

  // 6. /list/<token> shape → /tvg/<token>.xml.gz (some Stalker
  //    portal frontends).
  if (/\/list\//i.test(path)) {
    const noExt = path.replace(/\.m3u8?$/i, '').replace(/\/list\//i, '/tvg/');
    out.add(`${origin}${noExt}.xml.gz${search}`);
  }

  return Array.from(out);
}
