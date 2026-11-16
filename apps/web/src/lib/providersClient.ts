'use client';

// Browser-side access to /api/providers. Credentials go up once, when a
// connection is added; nothing secret ever comes back down.

import type { Capabilities, AccountInfo, Category, Movie, MovieDetail, Series, SeriesDetail } from './providers/types';
import { getUserSourceUrl } from './channelCache';

export interface PublicProvider {
  id: string; type: 'xtream' | 'stalker'; name: string; createdAt: number;
  capabilities: Capabilities; account: AccountInfo | null; checkedAt: number; label: string;
}

export class ProviderApiError extends Error {
  status: number; code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { credentials: 'include', ...init });
  if (!r.ok) {
    let code = 'error', message = `Request failed (${r.status})`;
    try { const b = await r.json(); code = b.error || code; message = b.message || message; } catch { /* not JSON */ }
    if (r.status === 401) message = 'Sign in to use your providers.';
    if (r.status === 402) message = 'Your free trial has ended. Subscribe to keep watching.';
    if (r.status === 429) message = 'Too many requests — try again in a moment.';
    throw new ProviderApiError(r.status, code, message);
  }
  return r.json() as Promise<T>;
}

export const listProviders = () => call<{ providers: PublicProvider[]; encryption: boolean }>('/api/providers');
export const addProvider = (body: { type: 'xtream' | 'stalker'; name: string; config: Record<string, string> }) =>
  call<{ provider: PublicProvider }>('/api/providers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
export const removeProvider = (id: string) => call<{ ok: true }>(`/api/providers/${id}`, { method: 'DELETE' });
export const checkProvider = (id: string) => call<{ provider: PublicProvider; problem: string | null }>(`/api/providers/${id}`);

const cache = new Map<string, { at: number; p: Promise<unknown> }>();
function cached<T>(key: string, fn: () => Promise<T>, ms = 5 * 60_000): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.p as Promise<T>;
  const p = fn().catch((e) => { cache.delete(key); throw e; });
  cache.set(key, { at: Date.now(), p });
  return p;
}

export const getMovies = (id: string, category?: string) =>
  cached(`vod:${id}:${category ?? ''}`, () => call<{ categories: Category[]; movies: Movie[] }>(`/api/providers/${id}/vod${category ? `?category=${encodeURIComponent(category)}` : ''}`));
export const getMovie = (id: string, vid: string) =>
  cached(`vod1:${id}:${vid}`, () => call<{ movie: MovieDetail }>(`/api/providers/${id}/vod/${encodeURIComponent(vid)}`));
export const getSeriesList = (id: string, category?: string) =>
  cached(`ser:${id}:${category ?? ''}`, () => call<{ categories: Category[]; series: Series[] }>(`/api/providers/${id}/series${category ? `?category=${encodeURIComponent(category)}` : ''}`));
export const getSeries = (id: string, sid: string) =>
  cached(`ser1:${id}:${sid}`, () => call<SeriesDetail>(`/api/providers/${id}/series/${encodeURIComponent(sid)}`));

export function playUrl(id: string, kind: 'movie' | 'episode', itemId: string, ext: string): string {
  return `/api/providers/${id}/play/${kind}/${encodeURIComponent(itemId)}.${ext || 'mp4'}`;
}

/** Provider id of the active source, if the active source is a provider. */
export function activeProviderId(): string | null {
  const src = getUserSourceUrl();
  return src && src.url.startsWith('provider:') ? src.url.slice('provider:'.length) : null;
}

const CAPS_KEY = 'ns.providerCaps';
/** Capabilities of the active provider, cached locally so nav can render synchronously. */
export function cachedCaps(id: string | null): Capabilities | null {
  if (!id || typeof window === 'undefined') return null;
  try { return (JSON.parse(localStorage.getItem(CAPS_KEY) || '{}') as Record<string, Capabilities>)[id] ?? null; }
  catch { return null; }
}
export function rememberCaps(id: string, caps: Capabilities) {
  try {
    const all = JSON.parse(localStorage.getItem(CAPS_KEY) || '{}') as Record<string, Capabilities>;
    all[id] = caps;
    localStorage.setItem(CAPS_KEY, JSON.stringify(all));
  } catch { /* storage unavailable */ }
}
