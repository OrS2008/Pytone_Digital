// Mock IPTV providers that answer with the response shapes of the real
// APIs (Xtream Codes player_api.php and Stalker/Ministra load.php).
// Used with helpers.mockFetch. These prove our clients parse and call
// the protocols correctly; they are not a substitute for a real provider.

export const XT = { server: 'http://xtream.example.com:8080', user: 'alice', pass: 's3cret' };

export function xtreamRoutes({ status = 'Active', auth = 1, formats = ['m3u8', 'ts'], timezone = 'Europe/Paris', log = [] } = {}) {
  return [[(u) => u.startsWith(XT.server), (u) => {
    const url = new URL(u);
    log.push(url.pathname + url.search);
    if (url.pathname === '/player_api.php') {
      const q = url.searchParams;
      if (q.get('username') !== XT.user || q.get('password') !== XT.pass) {
        return Response.json({ user_info: { auth: 0 } });
      }
      const action = q.get('action');
      if (!action) return Response.json({
        user_info: { username: XT.user, auth, status, exp_date: '1893456000', is_trial: '0', active_cons: '1', max_connections: '2', allowed_output_formats: formats },
        server_info: { url: 'xtream.example.com', port: '8080', timezone, timestamp_now: Math.floor(Date.now() / 1000) },
      });
      if (action === 'get_live_categories') return Response.json([{ category_id: '1', category_name: 'News', parent_id: 0 }, { category_id: '2', category_name: 'Sport', parent_id: 0 }]);
      if (action === 'get_live_streams') return Response.json([
        { num: 1, name: 'World News HD', stream_type: 'live', stream_id: 101, stream_icon: 'http://img.example.com/wn.png', epg_channel_id: 'wn.uk', category_id: '1', tv_archive: 1, tv_archive_duration: '3' },
        { num: 2, name: 'Sport 1', stream_type: 'live', stream_id: 102, stream_icon: 'javascript:alert(1)', epg_channel_id: '', category_id: '2', tv_archive: 0 },
        { num: 3, name: 'Broken row without id' },
      ]);
      if (action === 'get_vod_categories') return Response.json([{ category_id: '10', category_name: 'Action' }]);
      if (action === 'get_vod_streams') return Response.json([
        { num: 1, name: 'The Movie (2021)', stream_type: 'movie', stream_id: 501, stream_icon: 'http://img.example.com/m.jpg', rating_5based: 4.2, added: '1700000000', category_id: '10', container_extension: 'mkv' },
      ]);
      if (action === 'get_vod_info') return Response.json({
        info: { movie_image: 'http://img.example.com/m.jpg', backdrop_path: ['http://img.example.com/bd.jpg'], plot: 'A plot.', genre: 'Action', releasedate: '2021-05-01', duration_secs: 5400, rating: '8.4', cast: 'A, B', director: 'C' },
        movie_data: { stream_id: 501, name: 'The Movie', container_extension: 'mkv', category_id: '10', added: '1700000000' },
      });
      if (action === 'get_series_categories') return Response.json([{ category_id: '20', category_name: 'Drama' }]);
      if (action === 'get_series') return Response.json([{ num: 1, name: 'A Series', series_id: 900, cover: 'http://img.example.com/s.jpg', plot: 'p', genre: 'Drama', releaseDate: '2019-01-01', rating_5based: 4, category_id: '20' }]);
      if (action === 'get_series_info') return Response.json({
        seasons: [{ season_number: 1, name: 'Season One' }, { season_number: 2, name: 'Season Two' }],
        info: { name: 'A Series', cover: 'http://img.example.com/s.jpg', plot: 'p', genre: 'Drama', releaseDate: '2019', backdrop_path: [], category_id: '20' },
        episodes: {
          '2': [{ id: '9021', episode_num: 1, title: 'S2E1', container_extension: 'mp4', season: 2, info: { duration_secs: 2700 } }],
          '1': [{ id: '9012', episode_num: 2, title: 'S1E2', container_extension: 'mp4', season: 1, info: {} },
                { id: '9011', episode_num: 1, title: 'S1E1', container_extension: 'mp4', season: 1, info: { plot: 'Pilot', movie_image: 'http://img.example.com/e.jpg' } }],
        },
      });
      return Response.json([]);
    }
    if (url.pathname.startsWith('/live/') || url.pathname.startsWith('/timeshift/')) {
      return new Response('#EXTM3U\n#EXTINF:4,\n' + `${XT.server}/hls/${XT.user}/${XT.pass}/seg1.ts\n`, { headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
    }
    if (url.pathname.startsWith('/xmltv.php')) return new Response('<tv><channel id="wn.uk"/></tv>', { headers: { 'content-type': 'application/xml' } });
    return new Response(new Uint8Array(188), { headers: { 'content-type': 'video/mp2t' } });
  }]];
}

export const ST = { portal: 'http://stalker.example.com', mac: '00:1A:79:AB:CD:EF' };

export function stalkerRoutes({ expireAfter = Infinity, knownMac = ST.mac, log = [] } = {}) {
  let tokens = 0;
  let calls = 0;
  const valid = new Set();
  return [[(u) => u.startsWith(ST.portal), (u, req) => {
    const url = new URL(u);
    const q = url.searchParams;
    log.push({ path: url.pathname, action: q.get('type') + '.' + q.get('action'), auth: req.headers.get('authorization'), cookie: req.headers.get('cookie'), ua: req.headers.get('user-agent') });
    if (url.pathname !== '/stalker_portal/server/load.php') return new Response('not found', { status: 404 });
    const cookieMac = decodeURIComponent((/mac=([^;]+)/.exec(req.headers.get('cookie') || '') || [])[1] || '');
    if (q.get('action') === 'handshake') {
      const t = 'TOKEN' + (++tokens);
      valid.add(t);
      return Response.json({ js: { token: t } });
    }
    const bearer = (req.headers.get('authorization') || '').replace('Bearer ', '');
    calls++;
    if (!valid.has(bearer) || calls > expireAfter) { valid.delete(bearer); calls = 0; expireAfter = Infinity; return new Response('Authorization failed.', { status: 200 }); }
    if (cookieMac !== knownMac) return Response.json({ js: {} });
    const key = q.get('type') + '.' + q.get('action');
    switch (key) {
      case 'stb.get_profile': return Response.json({ js: { id: '77', name: 'MAG', mac: cookieMac, status: 0, blocked: '0' } });
      case 'account_info.get_main_info': return Response.json({ js: { mac: cookieMac, end_date: '2030-01-01 00:00:00' } });
      case 'itv.get_genres': return Response.json({ js: [{ id: '*', title: 'All' }, { id: '5', title: 'Movies TV' }] });
      case 'itv.get_all_channels': return Response.json({ js: { total_items: 2, data: [
        { id: '3001', name: 'Portal One', number: '1', cmd: 'ffrt http://localhost/ch/3001', logo: 'http://img.example.com/p1.png', tv_genre_id: '5', xmltv_id: 'p1' },
        { id: '3002', name: 'Portal Two', number: '2', cmd: 'ffrt http://localhost/ch/3002', logo: '', tv_genre_id: '5' },
      ] } });
      case 'itv.create_link': return Response.json({ js: { id: '1', cmd: 'ffmpeg http://cdn.stalker.example.com/live/3001.m3u8?play_token=abc123' } });
      case 'vod.get_categories': return Response.json({ js: [{ id: '*', title: 'All' }, { id: '8', title: 'Films' }] });
      case 'vod.get_ordered_list':
        if (q.get('movie_id')) return Response.json({ js: { total_items: 2, data: [
          { id: '700:1', name: 'Season 1', cmd: 'eyJ0eXBlIjoic2VyaWVzIn0=', series: [1, 2, 3] },
          { id: '700:2', name: 'Season 2', cmd: 'eyJ0eXBlIjoic2VyaWVzMiJ9', series: [1] },
        ] } });
        return Response.json({ js: { total_items: 2, max_page_items: 14, data: [
          { id: '600', name: 'Portal Film', year: '2020', description: 'desc', genres_str: 'Drama', screenshot_uri: 'http://img.example.com/f.jpg', cmd: '/media/600.mpg', is_series: '0', time: '95', category_id: '8' },
          { id: '700', name: 'Portal Show', year: '2018', screenshot_uri: '', cmd: '', is_series: '1', category_id: '8' },
        ] } });
      case 'vod.create_link': return Response.json({ js: { cmd: 'ffmpeg http://cdn.stalker.example.com/vod/' + (q.get('series') ? 'ep' + q.get('series') : 'film') + '.mp4?t=xyz' } });
      default: return Response.json({ js: [] });
    }
  }]];
}
