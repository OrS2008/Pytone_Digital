// Factory: provider record → client, wired to the SSRF-safe transport.

import { safeFetch } from '../ssrfGuard';
import { ProviderError, type Http, type ProviderClient, type ProviderType } from './types';
import { XtreamClient, normaliseXtreamConfig, type XtreamConfig } from './xtream';
import { StalkerClient, normaliseStalkerConfig, type StalkerConfig } from './stalker';

export type ProviderConfig = XtreamConfig | StalkerConfig;

const TIMEOUT_MS = 20_000;

/** Outbound HTTP for providers: SSRF checks on every hop, timeout. */
export const safeHttp: Http = async (url, init) => {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const { response } = await safeFetch(url, { headers: init?.headers ?? {} }, { maxRedirects: 4, signal: ac.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
};

export function normaliseConfig(type: unknown, config: unknown): { type: ProviderType; config: ProviderConfig } {
  const c = (config && typeof config === 'object' ? config : {}) as Record<string, unknown>;
  if (type === 'xtream') return { type, config: normaliseXtreamConfig(c as Partial<XtreamConfig>) };
  if (type === 'stalker') return { type, config: normaliseStalkerConfig(c as Partial<StalkerConfig>) };
  throw new ProviderError('invalid_config', 'type must be "xtream" or "stalker"');
}

export function makeClient(type: ProviderType, config: ProviderConfig, http: Http = safeHttp): ProviderClient {
  if (type === 'xtream') return new XtreamClient(config as XtreamConfig, http);
  return new StalkerClient(config as StalkerConfig, http);
}

export * from './types';
