// Xtream Codes API client (player_api.php).
//
// Endpoints used — all GET on `${server}/player_api.php?username=&password=`:
//   (no action)                 → { user_info, server_info }        login / account
//   action=get_live_categories  → [{ category_id, category_name }]
//   action=get_live_streams     → [{ num, name, stream_id, stream_icon, epg_channel_id,
//                                    category_id, tv_archive, tv_archive_duration }]
//   action=get_vod_categories / get_vod_streams / get_vod_info&vod_id=
//   action=get_series_categories / get_series / get_series_info&series_id=
// Playback paths:
//   live     ${server}/live/${u}/${p}/${id}.m3u8   (or .ts)
//   movie    ${server}/movie/${u}/${p}/${id}.${ext}
//   episode  ${server}/series/${u}/${p}/${id}.${ext}
//   catch-up ${server}/timeshift/${u}/${p}/${minutes}/${YYYY-MM-DD:HH-MM}/${id}.m3u8
//            (start expressed in the SERVER's timezone, from server_info.timezone)
//   guide    ${server}/xmltv.php?username=&password=
//
// Credentials only ever appear in URLs built here, on the server.

import {
  ProviderError,
  type AccountInfo, type Capabilities, type Category, type Episode, type Http,
  type LiveChannel, type Movie, type MovieDetail, type PlayRef, type ProviderClient,
  type ResolvedStream, type Series, type SeriesDetail,
} from './types';
import { asArray, getJson, imageUrl, num, safeExt, str, yearOf } from './util';

export interface XtreamConfig { server: string; username: string; password: string }

/** Validate and canonicalise user input. Throws ProviderError('invalid_config'). */
export function normaliseXtreamConfig(raw: Partial<XtreamConfig>): XtreamConfig {
  const username = str(raw.username);
  const password = str(raw.password);
  let server = str(raw.server);
  if (!server || !username || !password) throw new ProviderError('invalid_config', 'server, username and password are required');
  if (username.length > 128 || password.length > 128) throw new ProviderError('invalid_config', 'username or password too long');
  // A foreign scheme (ftp://, file://…) must be refused, not "fixed" by
  // prefixing http:// — that would turn `ftp://x` into host "ftp".
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(server) && !/^https?:\/\//i.test(server)) throw new ProviderError('invalid_config', 'server must be http or https');
  if (!/^https?:\/\//i.test(server)) server = 'http://' + server;
  let u: URL;
  try { u = new URL(server); } catch { throw new ProviderError('invalid_config', 'server is not a valid URL'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new ProviderError('invalid_config', 'server must be http or https');
  if (u.username || u.password) throw new ProviderError('invalid_config', 'put the credentials in their own fields, not in the URL');
  // People paste the full get.php / player_api.php link; keep only the base.
  const path = u.pathname.replace(/\/(player_api|get|xmltv|panel_api)\.php$/i, '').replace(/\/+$/, '');
  return { server: `${u.protocol}//${u.host}${path}`, username, password };
}

interface UserInfo {
  auth?: number | string; status?: string; exp_date?: string | number | null;
  is_trial?: string | number; active_cons?: string | number; max_connections?: string | number;
  allowed_output_formats?: string[];
}
interface ServerInfo { timezone?: string; timestamp_now?: number | string }

export class XtreamClient implements ProviderClient {
  readonly type = 'xtream' as const;
  private info: { user: UserInfo; server: ServerInfo } | null = null;
  private liveCache: LiveChannel[] | null = null;

  private cfg: XtreamConfig;
  private http: Http;
  constructor(cfg: XtreamConfig, http: Http) { this.cfg = cfg; this.http = http; }

  private api(action?: string, extra: Record<string, string> = {}): string {
    const q = new URLSearchParams({ username: this.cfg.username, password: this.cfg.password, ...(action ? { action } : {}), ...extra });
    return `${this.cfg.server}/player_api.php?${q}`;
  }

  private async call<T>(action?: string, extra?: Record<string, string>): Promise<T> {
    return getJson<T>(this.http, this.api(action, extra));
  }

  async login(): Promise<AccountInfo> {
    const r = await this.call<{ user_info?: UserInfo; server_info?: ServerInfo }>();
    const user = r && typeof r === 'object' ? r.user_info : undefined;
    if (!user || String(user.auth) !== '1') throw new ProviderError('auth_failed', 'The provider rejected these credentials.');
    this.info = { user, server: r.server_info ?? {} };
    const status = str(user.status) || 'Active';
    const exp = num(user.exp_date);
    const account: AccountInfo = {
      status,
      expiresAt: exp ? exp * 1000 : null,
      isTrial: String(user.is_trial) === '1',
      activeConnections: num(user.active_cons),
      maxConnections: num(user.max_connections),
    };
    if (!/^active$/i.test(status)) throw new ProviderError('account_inactive', `Provider account is ${status}.`);
    return account;
  }

  private async ensureLogin(): Promise<void> { if (!this.info) await this.login(); }

  async capabilities(): Promise<Capabilities> {
    await this.ensureLogin();
    const [vod, series, live] = await Promise.all([
      this.vodCategories().catch(() => []),
      this.seriesCategories().catch(() => []),
      this.liveChannels().catch(() => [] as LiveChannel[]),
    ]);
    return {
      live: live.length > 0,
      vod: vod.length > 0,
      series: series.length > 0,
      epg: true,
      catchup: live.some((c) => c.catchupDays > 0),
    };
  }

  private categories(action: string) {
    return this.call<unknown>(action).then((r) => asArray<Record<string, unknown>>(r)
      .map((c) => ({ id: str(c.category_id), name: str(c.category_name) || 'Other' }))
      .filter((c) => c.id) as Category[]);
  }

  liveCategories() { return this.categories('get_live_categories'); }
  vodCategories() { return this.categories('get_vod_categories'); }
  seriesCategories() { return this.categories('get_series_categories'); }

  async liveChannels(): Promise<LiveChannel[]> {
    if (this.liveCache) return this.liveCache;
    const rows = asArray<Record<string, unknown>>(await this.call('get_live_streams'));
    const out: LiveChannel[] = [];
    rows.forEach((r, i) => {
      const id = str(r.stream_id);
      if (!id) return;
      out.push({
        id,
        number: num(r.num) ?? i + 1,
        name: str(r.name) || `Channel ${i + 1}`,
        logo: imageUrl(r.stream_icon),
        categoryId: str(r.category_id),
        epgId: str(r.epg_channel_id),
        catchupDays: String(r.tv_archive) === '1' ? Math.max(1, num(r.tv_archive_duration) ?? 1) : 0,
      });
    });
    this.liveCache = out;
    return out;
  }

  async movies(categoryId?: string): Promise<Movie[]> {
    const rows = asArray<Record<string, unknown>>(await this.call('get_vod_streams', categoryId ? { category_id: categoryId } : {}));
    return rows.filter((r) => str(r.stream_id)).map((r) => ({
      id: str(r.stream_id),
      name: str(r.name),
      poster: imageUrl(r.stream_icon),
      categoryId: str(r.category_id),
      rating: num(r.rating_5based) !== null ? (num(r.rating_5based) as number) * 2 : num(r.rating),
      year: yearOf(r.year) ?? yearOf(r.name),
      added: num(r.added) ? (num(r.added) as number) * 1000 : null,
      ext: safeExt(r.container_extension, 'mp4'),
    }));
  }

  async movieDetail(id: string): Promise<MovieDetail> {
    const r = await this.call<{ info?: Record<string, unknown>; movie_data?: Record<string, unknown> }>('get_vod_info', { vod_id: id });
    const info = (r && r.info) || {};
    const data = (r && r.movie_data) || {};
    if (!str(data.stream_id) && !str(info.name)) throw new ProviderError('unsupported', 'This title is not available.');
    const secs = num(info.duration_secs);
    const backdrops = asArray<string>(info.backdrop_path);
    return {
      id,
      name: str(data.name) || str(info.name),
      poster: imageUrl(info.movie_image) || imageUrl(info.cover_big),
      categoryId: str(data.category_id),
      rating: num(info.rating),
      year: yearOf(info.releasedate) ?? yearOf(info.release_date),
      added: num(data.added) ? (num(data.added) as number) * 1000 : null,
      ext: safeExt(data.container_extension, 'mp4'),
      plot: str(info.plot) || str(info.description),
      genre: str(info.genre),
      durationMin: secs ? Math.round(secs / 60) : null,
      cast: str(info.cast) || str(info.actors),
      director: str(info.director),
      backdrop: imageUrl(backdrops[0]),
    };
  }

  async series(categoryId?: string): Promise<Series[]> {
    const rows = asArray<Record<string, unknown>>(await this.call('get_series', categoryId ? { category_id: categoryId } : {}));
    return rows.filter((r) => str(r.series_id)).map((r) => ({
      id: str(r.series_id),
      name: str(r.name),
      poster: imageUrl(r.cover),
      categoryId: str(r.category_id),
      rating: num(r.rating_5based) !== null ? (num(r.rating_5based) as number) * 2 : num(r.rating),
      year: yearOf(r.releaseDate) ?? yearOf(r.release_date),
      plot: str(r.plot),
      genre: str(r.genre),
    }));
  }

  async seriesDetail(id: string): Promise<SeriesDetail> {
    const r = await this.call<{ info?: Record<string, unknown>; seasons?: unknown; episodes?: unknown }>('get_series_info', { series_id: id });
    if (!r || typeof r !== 'object' || !r.info) throw new ProviderError('unsupported', 'This series is not available.');
    const info = r.info;
    const seasonMeta = new Map<number, string>();
    for (const s of asArray<Record<string, unknown>>(r.seasons)) {
      const n = num(s.season_number);
      if (n !== null) seasonMeta.set(n, str(s.name));
    }
    // `episodes` is an object keyed by season number: { "1": [ … ], "2": [ … ] }
    const bySeason = new Map<number, Episode[]>();
    const eps = r.episodes && typeof r.episodes === 'object' ? (r.episodes as Record<string, unknown>) : {};
    for (const [key, list] of Object.entries(eps)) {
      for (const e of asArray<Record<string, unknown>>(list)) {
        const epId = str(e.id);
        if (!epId) continue;
        const season = num(e.season) ?? num(key) ?? 1;
        const ei = (e.info && typeof e.info === 'object' ? e.info : {}) as Record<string, unknown>;
        const secs = num(ei.duration_secs);
        const ep: Episode = {
          id: epId,
          season,
          number: num(e.episode_num) ?? 0,
          title: str(e.title),
          plot: str(ei.plot),
          durationMin: secs ? Math.round(secs / 60) : null,
          still: imageUrl(ei.movie_image),
          ext: safeExt(e.container_extension, 'mp4'),
        };
        if (!bySeason.has(season)) bySeason.set(season, []);
        bySeason.get(season)!.push(ep);
      }
    }
    const seasons = [...bySeason.entries()].sort((a, b) => a[0] - b[0]).map(([n, list]) => ({
      number: n,
      name: seasonMeta.get(n) || `Season ${n}`,
      episodes: list.sort((a, b) => a.number - b.number),
    }));
    const backdrops = asArray<string>(info.backdrop_path);
    return {
      series: {
        id,
        name: str(info.name),
        poster: imageUrl(info.cover),
        categoryId: str(info.category_id),
        rating: num(info.rating_5based) !== null ? (num(info.rating_5based) as number) * 2 : num(info.rating),
        year: yearOf(info.releaseDate) ?? yearOf(info.release_date),
        plot: str(info.plot),
        genre: str(info.genre),
        backdrop: imageUrl(backdrops[0]),
        cast: str(info.cast),
        director: str(info.director),
      },
      seasons,
    };
  }

  private path(kind: string, id: string, ext: string): string {
    const u = encodeURIComponent(this.cfg.username);
    const p = encodeURIComponent(this.cfg.password);
    return `${this.cfg.server}/${kind}/${u}/${p}/${encodeURIComponent(id)}.${ext}`;
  }

  async resolve(ref: PlayRef): Promise<ResolvedStream> {
    if (!/^[\w-]{1,32}$/.test(ref.id)) throw new ProviderError('invalid_config', 'bad id');
    switch (ref.kind) {
      case 'live': {
        await this.ensureLogin();
        const formats = this.info?.user.allowed_output_formats;
        // HLS whenever the panel allows it — raw MPEG-TS cannot play in
        // a browser. Panels that send no list usually allow both.
        const ext = !formats || formats.length === 0 || formats.includes('m3u8') ? 'm3u8' : 'ts';
        return { url: this.path('live', ref.id, ext) };
      }
      case 'movie':   return { url: this.path('movie', ref.id, safeExt(ref.ext, 'mp4')) };
      case 'episode': return { url: this.path('series', ref.id, safeExt(ref.ext, 'mp4')) };
      case 'catchup': {
        await this.ensureLogin();
        const minutes = Math.max(1, Math.min(24 * 60, Math.round(ref.durationMin)));
        const stamp = formatInZone(ref.startSec * 1000, this.info?.server.timezone);
        const u = encodeURIComponent(this.cfg.username);
        const p = encodeURIComponent(this.cfg.password);
        return { url: `${this.cfg.server}/timeshift/${u}/${p}/${minutes}/${stamp}/${encodeURIComponent(ref.id)}.m3u8` };
      }
    }
  }

  epgUrl(): string {
    const q = new URLSearchParams({ username: this.cfg.username, password: this.cfg.password });
    return `${this.cfg.server}/xmltv.php?${q}`;
  }
}

/** `YYYY-MM-DD:HH-MM` for an instant, in an IANA zone (UTC if unknown). */
export function formatInZone(ms: number, zone?: string): string {
  let tz = 'UTC';
  if (zone) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); tz = zone; } catch { /* unknown zone → UTC */ }
  }
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}:${parts.hour}-${parts.minute}`;
}
