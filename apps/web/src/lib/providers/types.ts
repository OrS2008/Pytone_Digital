// Provider-independent content model.
//
// Every IPTV source (Xtream Codes, Stalker/MAG portal, …) is adapted to
// these shapes on the server. The UI and the player only ever see these
// types — never a provider's own response format.

export type ProviderType = 'xtream' | 'stalker';

export interface Capabilities {
  live:    boolean;
  vod:     boolean;
  series:  boolean;
  /** An XMLTV guide can be fetched for this source. */
  epg:     boolean;
  /** At least one channel advertises a replay archive we can address. */
  catchup: boolean;
}

export interface AccountInfo {
  /** Provider's own wording, e.g. "Active", "Expired", "Banned". */
  status:             string;
  /** Epoch ms, or null when the provider reports no expiry (unlimited). */
  expiresAt:          number | null;
  isTrial?:           boolean;
  activeConnections?: number | null;
  maxConnections?:    number | null;
}

export interface Category { id: string; name: string }

export interface LiveChannel {
  id:          string;
  number:      number;
  name:        string;
  logo:        string;
  categoryId:  string;
  epgId:       string;
  /** Days of replay archive; 0 = none. */
  catchupDays: number;
}

export interface Movie {
  id:         string;
  name:       string;
  poster:     string;
  categoryId: string;
  rating:     number | null;
  year:       number | null;
  added:      number | null;   // epoch ms
  ext:        string;          // container extension for playback
}

export interface MovieDetail extends Movie {
  plot:      string;
  genre:     string;
  durationMin: number | null;
  cast:      string;
  director:  string;
  backdrop:  string;
}

export interface Series {
  id:         string;
  name:       string;
  poster:     string;
  categoryId: string;
  rating:     number | null;
  year:       number | null;
  plot:       string;
  genre:      string;
}

export interface Episode {
  id:          string;
  season:      number;
  number:      number;
  title:       string;
  plot:        string;
  durationMin: number | null;
  still:       string;
  ext:         string;
}

export interface SeriesDetail {
  series:  Series & { backdrop: string; cast: string; director: string };
  seasons: Array<{ number: number; name: string; episodes: Episode[] }>;
}

export type PlayRef =
  | { kind: 'live';    id: string }
  | { kind: 'movie';   id: string; ext: string }
  | { kind: 'episode'; id: string; ext: string }
  | { kind: 'catchup'; id: string; startSec: number; durationMin: number };

/** What the stream proxy needs to fetch a playable URL. */
export interface ResolvedStream { url: string; ua?: string; ref?: string }

export interface ProviderClient {
  readonly type: ProviderType;
  /** Authenticate; throws ProviderError on bad credentials / unreachable. */
  login(): Promise<AccountInfo>;
  capabilities(): Promise<Capabilities>;
  liveCategories(): Promise<Category[]>;
  liveChannels(): Promise<LiveChannel[]>;
  vodCategories(): Promise<Category[]>;
  movies(categoryId?: string): Promise<Movie[]>;
  movieDetail(id: string): Promise<MovieDetail>;
  seriesCategories(): Promise<Category[]>;
  series(categoryId?: string): Promise<Series[]>;
  seriesDetail(id: string): Promise<SeriesDetail>;
  resolve(ref: PlayRef): Promise<ResolvedStream>;
  /** Upstream XMLTV URL (may carry credentials — server-side only). */
  epgUrl(): string | null;
}

export type ProviderErrorCode =
  | 'invalid_config'      // malformed input — caller's fault
  | 'auth_failed'         // provider rejected the credentials
  | 'account_inactive'    // expired / banned / disabled
  | 'unreachable'         // network / DNS / timeout / SSRF refusal
  | 'bad_response'        // provider answered with something unparseable
  | 'unsupported';        // the provider does not offer this

export class ProviderError extends Error {
  code: ProviderErrorCode;
  constructor(code: ProviderErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'ProviderError';
  }
}

/** Injected transport, so clients are testable without a network. */
export type Http = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;
