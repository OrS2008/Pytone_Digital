// Stalker / Ministra portal client (the API MAG set-top boxes use).
//
// Protocol, as implemented by Stalker/Ministra middleware:
//   API endpoint   ${origin}/stalker_portal/server/load.php  or  ${origin}/portal.php
//                  (both are tried; the one that answers is remembered)
//   Identity       the subscriber's MAC address, sent as a cookie
//                  `mac=00:1A:79:..; stb_lang=en; timezone=UTC`
//                  with a MAG User-Agent. The provider authorises MACs —
//                  this client never guesses or rotates them.
//   Session        type=stb&action=handshake        → js.token
//                  then  Authorization: Bearer <token>
//                  type=stb&action=get_profile      → registers the session
//   Account        type=account_info&action=get_main_info
//   Live           type=itv&action=get_genres / get_all_channels
//                  type=itv&action=create_link&cmd=…   → js.cmd "ffmpeg http://…"
//   Guide          type=itv&action=get_epg_info&period=<hours> → js.data { <ch_id>: [programmes] }
//                  converted to XMLTV so the app's guide pipeline is unchanged
//   VOD / series   type=vod&action=get_categories / get_ordered_list&category=&p=
//                  series: get_ordered_list&movie_id=X&season_id=0 → seasons,
//                  each season carries `cmd` and `series` (episode numbers);
//                  create_link&cmd=<season cmd>&series=<episode number>
//
// Tokens expire; on an authorisation failure the client re-handshakes once.
// Not implemented (documented in IPTV_PROVIDER_INTEGRATION_REPORT.md):
// the portal's archive (catch-up) API — capabilities report it as
// unavailable rather than pretending.

import {
  ProviderError,
  type AccountInfo, type Capabilities, type Category, type Episode, type Http,
  type LiveChannel, type Movie, type MovieDetail, type PlayRef, type ProviderClient,
  type ResolvedStream, type Series, type SeriesDetail,
} from './types';
import { asArray, getJson, imageUrl, num, str, yearOf } from './util';

export interface StalkerConfig { portal: string; mac: string }

const MAG_UA = 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3';
const MAX_PAGES = 25;

export function normaliseStalkerConfig(raw: Partial<StalkerConfig>): StalkerConfig {
  let portal = str(raw.portal);
  const mac = str(raw.mac).toUpperCase().replace(/-/g, ':');
  if (!portal || !mac) throw new ProviderError('invalid_config', 'portal URL and MAC address are required');
  if (!/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/.test(mac)) throw new ProviderError('invalid_config', 'MAC address must look like 00:1A:79:12:34:56');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(portal) && !/^https?:\/\//i.test(portal)) throw new ProviderError('invalid_config', 'portal must be http or https');
  if (!/^https?:\/\//i.test(portal)) portal = 'http://' + portal;
  let u: URL;
  try { u = new URL(portal); } catch { throw new ProviderError('invalid_config', 'portal is not a valid URL'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new ProviderError('invalid_config', 'portal must be http or https');
  if (u.username || u.password) throw new ProviderError('invalid_config', 'credentials in the portal URL are not allowed');
  // Keep scheme://host[:port] plus a /stalker_portal prefix when present.
  const prefix = /\/stalker_portal(\/|$)/i.test(u.pathname) ? '/stalker_portal' : '';
  return { portal: `${u.protocol}//${u.host}${prefix}`, mac };
}

// Session tokens per portal+MAC, shared across requests in the isolate.
const SESSIONS = new Map<string, { token: string; endpoint: string; at: number }>();
const SESSION_MS = 20 * 60_000;

type Js<T> = { js?: T };

export class StalkerClient implements ProviderClient {
  readonly type = 'stalker' as const;
  private cfg: StalkerConfig;
  private http: Http;
  private profile: Record<string, unknown> | null = null;

  constructor(cfg: StalkerConfig, http: Http) { this.cfg = cfg; this.http = http; }

  private key() { return `${this.cfg.portal}|${this.cfg.mac}`; }

  private endpoints(): string[] {
    return this.cfg.portal.endsWith('/stalker_portal')
      ? [`${this.cfg.portal}/server/load.php`]
      : [`${this.cfg.portal}/portal.php`, `${this.cfg.portal}/stalker_portal/server/load.php`, `${this.cfg.portal}/server/load.php`];
  }

  private headers(token?: string): Record<string, string> {
    const base = this.cfg.portal.endsWith('/stalker_portal') ? `${this.cfg.portal}/c/` : `${this.cfg.portal}/c/`;
    const h: Record<string, string> = {
      'user-agent': MAG_UA,
      'x-user-agent': 'Model: MAG250; Link: WiFi',
      cookie: `mac=${encodeURIComponent(this.cfg.mac)}; stb_lang=en; timezone=UTC`,
      referer: base,
      accept: '*/*',
    };
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }

  private async handshake(): Promise<{ token: string; endpoint: string }> {
    let lastErr: unknown = null;
    for (const endpoint of this.endpoints()) {
      try {
        const r = await getJson<Js<{ token?: string }>>(this.http, `${endpoint}?type=stb&action=handshake&token=&JsHttpRequest=1-xml`, this.headers());
        const token = str(r?.js?.token);
        if (token) {
          const s = { token, endpoint, at: Date.now() };
          SESSIONS.set(this.key(), s);
          return s;
        }
        lastErr = new ProviderError('auth_failed', 'portal refused the handshake');
      } catch (e) { lastErr = e; }
    }
    if (lastErr instanceof ProviderError) throw lastErr;
    throw new ProviderError('unreachable', 'No Stalker portal API answered at this address.');
  }

  private async session(): Promise<{ token: string; endpoint: string }> {
    const s = SESSIONS.get(this.key());
    if (s && Date.now() - s.at < SESSION_MS) return s;
    return this.handshake();
  }

  /** Authorised call; re-handshakes once if the token was rejected. */
  private async call<T>(params: Record<string, string>, retry = true): Promise<T> {
    const s = await this.session();
    const q = new URLSearchParams({ ...params, JsHttpRequest: '1-xml' });
    try {
      const r = await getJson<Js<T> | string>(this.http, `${s.endpoint}?${q}`, this.headers(s.token));
      if (typeof r === 'string' || (r && typeof r === 'object' && !('js' in r))) {
        // Expired tokens come back as "Authorization failed." text or {}.
        throw new ProviderError('auth_failed', 'portal session rejected');
      }
      return (r as Js<T>).js as T;
    } catch (e) {
      if (retry && e instanceof ProviderError && (e.code === 'auth_failed' || e.code === 'bad_response')) {
        SESSIONS.delete(this.key());
        return this.call<T>(params, false);
      }
      throw e;
    }
  }

  async login(): Promise<AccountInfo> {
    SESSIONS.delete(this.key());
    await this.handshake();
    const profile = await this.call<Record<string, unknown>>({
      type: 'stb', action: 'get_profile', hd: '1', ver: 'ImageDescription: 0.2.18-r23-250; ImageDate: Fri Jan 15 15:20:44 EET 2016; PORTAL version: 5.6.1',
      num_banks: '2', stb_type: 'MAG250', image_version: '218', video_out: 'hdmi', auth_second_step: '1', hw_version: '1.7-BD-00', not_valid_token: '0',
    });
    if (!profile || typeof profile !== 'object' || (!str(profile.id) && !str(profile.name) && !str(profile.mac))) {
      throw new ProviderError('auth_failed', 'The portal did not recognise this MAC address.');
    }
    this.profile = profile;
    const blocked = String(profile.blocked ?? '0') === '1' || String(profile.status ?? '0') === '1';
    let expiresAt: number | null = null;
    try {
      const info = await this.call<Record<string, unknown>>({ type: 'account_info', action: 'get_main_info' });
      expiresAt = parseExpiry(info?.end_date ?? info?.phone ?? profile.expire_billing_date);
    } catch { expiresAt = parseExpiry(profile.expire_billing_date); }
    if (blocked) throw new ProviderError('account_inactive', 'Provider account is blocked.');
    return { status: 'Active', expiresAt };
  }

  private async ensureLogin() { if (!this.profile) await this.login(); }

  async capabilities(): Promise<Capabilities> {
    await this.ensureLogin();
    const [live, vod] = await Promise.all([
      this.liveChannels().catch(() => [] as LiveChannel[]),
      this.vodCategories().catch(() => [] as Category[]),
    ]);
    // The guide is offered only if the portal actually returns programmes.
    const epg = await this.epgPrograms(3).then((d) => Object.values(d).some((l) => l.length > 0)).catch(() => false);
    return { live: live.length > 0, vod: vod.length > 0, series: vod.length > 0, epg, catchup: false };
  }

  async liveCategories(): Promise<Category[]> {
    await this.ensureLogin();
    const rows = asArray<Record<string, unknown>>(await this.call({ type: 'itv', action: 'get_genres' }));
    return rows.map((g) => ({ id: str(g.id), name: str(g.title) || 'Other' })).filter((g) => g.id && g.id !== '*');
  }

  async liveChannels(): Promise<LiveChannel[]> {
    await this.ensureLogin();
    const r = await this.call<{ data?: unknown }>({ type: 'itv', action: 'get_all_channels' });
    const rows = asArray<Record<string, unknown>>(r && typeof r === 'object' ? (r as { data?: unknown }).data : []);
    return rows.filter((c) => str(c.id) && str(c.cmd)).map((c, i) => ({
      id: str(c.id),
      number: num(c.number) ?? i + 1,
      name: str(c.name) || `Channel ${i + 1}`,
      logo: imageUrl(c.logo),
      categoryId: str(c.tv_genre_id),
      epgId: stalkerEpgId(c),
      catchupDays: 0,   // portal archive API not implemented — see header
    }));
  }

  async vodCategories(): Promise<Category[]> {
    await this.ensureLogin();
    const rows = asArray<Record<string, unknown>>(await this.call({ type: 'vod', action: 'get_categories' }));
    return rows.map((c) => ({ id: str(c.id), name: str(c.title) || 'Other' })).filter((c) => c.id && c.id !== '*');
  }
  seriesCategories() { return this.vodCategories(); }

  private async vodItems(categoryId?: string): Promise<Record<string, unknown>[]> {
    await this.ensureLogin();
    const out: Record<string, unknown>[] = [];
    for (let p = 1; p <= MAX_PAGES; p++) {
      const r = await this.call<{ data?: unknown; total_items?: unknown; max_page_items?: unknown }>({
        type: 'vod', action: 'get_ordered_list', category: categoryId || '*', p: String(p), sortby: 'added',
      });
      const page = asArray<Record<string, unknown>>(r?.data);
      out.push(...page);
      const total = num(r?.total_items) ?? 0;
      if (page.length === 0 || out.length >= total) break;
    }
    return out;
  }

  async movies(categoryId?: string): Promise<Movie[]> {
    return (await this.vodItems(categoryId)).filter((v) => String(v.is_series ?? '0') !== '1').map((v) => vodToMovie(v, categoryId));
  }

  async movieDetail(id: string): Promise<MovieDetail> {
    // The portal has no per-title endpoint; the list row is the detail.
    const row = (await this.vodItems()).find((v) => str(v.id) === id);
    if (!row) throw new ProviderError('unsupported', 'This title is not available.');
    const m = vodToMovie(row);
    return { ...m, plot: str(row.description), genre: str(row.genres_str), durationMin: num(row.time), cast: str(row.actors), director: str(row.director), backdrop: imageUrl(row.screenshot_uri) };
  }

  async series(categoryId?: string): Promise<Series[]> {
    return (await this.vodItems(categoryId)).filter((v) => String(v.is_series ?? '0') === '1').map((v) => ({
      id: str(v.id), name: str(v.name), poster: imageUrl(v.screenshot_uri), categoryId: str(v.category_id) || categoryId || '',
      rating: num(v.rating_imdb), year: yearOf(v.year), plot: str(v.description), genre: str(v.genres_str),
    }));
  }

  async seriesDetail(id: string): Promise<SeriesDetail> {
    await this.ensureLogin();
    const r = await this.call<{ data?: unknown }>({ type: 'vod', action: 'get_ordered_list', movie_id: id, season_id: '0', episode_id: '0', p: '1' });
    const seasonsRaw = asArray<Record<string, unknown>>(r?.data);
    if (seasonsRaw.length === 0) throw new ProviderError('unsupported', 'This series has no seasons on the portal.');
    const seasons = seasonsRaw.map((s, i) => {
      const n = num(String(s.name ?? '').replace(/\D+/g, '')) ?? i + 1;
      // Episode id encodes the season's cmd and the episode number so
      // resolve() can call create_link without another lookup.
      const cmd = str(s.cmd);
      const episodes: Episode[] = asArray<unknown>(s.series).map((e) => num(e)).filter((e): e is number => e !== null).map((e) => ({
        id: `${encodeB64(cmd)}~${e}`, season: n, number: e, title: `Episode ${e}`, plot: '', durationMin: null, still: '', ext: 'stalker',
      }));
      return { number: n, name: str(s.name) || `Season ${n}`, episodes };
    });
    const first = seasonsRaw[0];
    return {
      series: { id, name: str(first.o_name) || str(first.name), poster: imageUrl(first.screenshot_uri), categoryId: '', rating: null, year: yearOf(first.year), plot: str(first.description), genre: str(first.genres_str), backdrop: '', cast: '', director: '' },
      seasons,
    };
  }

  async resolve(ref: PlayRef): Promise<ResolvedStream> {
    await this.ensureLogin();
    if (ref.kind === 'catchup') throw new ProviderError('unsupported', 'Catch-up is not available for Stalker portals in Nova Stream yet.');
    let type: 'itv' | 'vod';
    let cmd: string;
    let series = '';
    if (ref.kind === 'live') {
      const ch = (await this.liveChannelsRaw()).find((c) => str(c.id) === ref.id);
      if (!ch) throw new ProviderError('unsupported', 'Channel not found on the portal.');
      type = 'itv'; cmd = str(ch.cmd);
    } else if (ref.kind === 'episode') {
      const [enc, ep] = ref.id.split('~');
      type = 'vod'; cmd = decodeB64(enc); series = ep || '';
    } else {
      const row = (await this.vodItems()).find((v) => str(v.id) === ref.id);
      if (!row) throw new ProviderError('unsupported', 'Title not found on the portal.');
      type = 'vod'; cmd = str(row.cmd);
    }
    if (!cmd) throw new ProviderError('unsupported', 'The portal returned no stream for this item.');
    const r = await this.call<{ cmd?: string }>({ type, action: 'create_link', cmd, series, forced_storage: 'undefined', disable_ad: '0', download: '0' });
    const url = str(r?.cmd).replace(/^(ffmpeg|ffrt\d*|auto)\s+/i, '');
    if (!/^https?:\/\//i.test(url)) throw new ProviderError('bad_response', 'The portal did not return a playable link.');
    return { url, ua: MAG_UA };
  }

  private rawChannels: Record<string, unknown>[] | null = null;
  private async liveChannelsRaw(): Promise<Record<string, unknown>[]> {
    if (this.rawChannels) return this.rawChannels;
    const r = await this.call<{ data?: unknown }>({ type: 'itv', action: 'get_all_channels' });
    this.rawChannels = asArray<Record<string, unknown>>(r?.data);
    return this.rawChannels;
  }

  epgUrl(): null { return null; }

  private async epgPrograms(hours: number): Promise<Record<string, Record<string, unknown>[]>> {
    await this.ensureLogin();
    const r = await this.call<{ data?: unknown }>({ type: 'itv', action: 'get_epg_info', period: String(hours) });
    const data = r && typeof r === 'object' ? (r as { data?: unknown }).data : null;
    if (!data || typeof data !== 'object') return {};
    const out: Record<string, Record<string, unknown>[]> = {};
    for (const [ch, list] of Object.entries(data as Record<string, unknown>)) out[ch] = asArray<Record<string, unknown>>(list);
    return out;
  }

  async epgXml(hours = 24): Promise<string> {
    const [programs, channels] = await Promise.all([this.epgPrograms(Math.max(1, Math.min(72, hours))), this.liveChannelsRaw()]);
    const idFor = new Map(channels.map((c) => [str(c.id), stalkerEpgId(c)]));
    const parts: string[] = ['<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="nova-stream-stalker">'];
    for (const c of channels) {
      parts.push(`<channel id="${xml(stalkerEpgId(c))}"><display-name>${xml(str(c.name))}</display-name></channel>`);
    }
    let count = 0;
    for (const [ch, list] of Object.entries(programs)) {
      const id = idFor.get(ch);
      if (!id) continue;
      for (const p of list) {
        const start = num(p.start_timestamp), stop = num(p.stop_timestamp);
        if (!start || !stop || stop <= start) continue;
        parts.push(`<programme start="${xmltvTime(start)}" stop="${xmltvTime(stop)}" channel="${xml(id)}"><title>${xml(str(p.name))}</title>${str(p.descr) ? `<desc>${xml(str(p.descr))}</desc>` : ''}</programme>`);
        count++;
      }
    }
    if (count === 0) throw new ProviderError('unsupported', 'This portal returned no programme guide.');
    parts.push('</tv>');
    return parts.join('\n');
  }
}

function vodToMovie(v: Record<string, unknown>, categoryId?: string): Movie {
  return {
    id: str(v.id), name: str(v.name), poster: imageUrl(v.screenshot_uri), categoryId: str(v.category_id) || categoryId || '',
    rating: num(v.rating_imdb), year: yearOf(v.year), added: null, ext: 'stalker',
  };
}

function parseExpiry(v: unknown): number | null {
  const s = str(v);
  if (!s || /unlimited|0000-00-00/i.test(s)) return null;
  const n = Number(s);
  if (Number.isFinite(n) && n > 1e9) return n < 1e12 ? n * 1000 : n;
  const t = Date.parse(s.replace(' ', 'T'));
  return Number.isFinite(t) ? t : null;
}

function encodeB64(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeB64(s: string): string {
  try { return decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))); } catch { return ''; }
}

/** Guide id for a portal channel: its XMLTV id if it has one, else a
 *  stable id derived from the portal's channel id (used in epgXml too). */
function stalkerEpgId(c: Record<string, unknown>): string {
  return str(c.xmltv_id) || `stalker.${str(c.id)}`;
}

function xml(s: string): string {
  return s.replace(/[<>&"']/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[ch] as string));
}

/** XMLTV timestamp in UTC: YYYYMMDDHHMMSS +0000 */
function xmltvTime(sec: number): string {
  const d = new Date(sec * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())} +0000`;
}
