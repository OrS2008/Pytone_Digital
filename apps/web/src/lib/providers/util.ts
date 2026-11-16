import { ProviderError, type Http } from './types';

export const MAX_JSON_BYTES = 40 * 1024 * 1024;

/** GET JSON with a size cap; maps transport failures to ProviderError. */
export async function getJson<T = unknown>(http: Http, url: string, headers?: Record<string, string>): Promise<T> {
  let res: Response;
  try { res = await http(url, { headers }); }
  catch (e) { throw new ProviderError('unreachable', (e as Error).message || 'request failed'); }
  if (res.status === 401 || res.status === 403) throw new ProviderError('auth_failed', `provider answered ${res.status}`);
  if (!res.ok) throw new ProviderError('unreachable', `provider answered ${res.status}`);
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > MAX_JSON_BYTES) throw new ProviderError('bad_response', 'response too large');
  const text = await res.text();
  if (text.length > MAX_JSON_BYTES) throw new ProviderError('bad_response', 'response too large');
  const trimmed = text.trim();
  if (!trimmed) return [] as unknown as T;          // some panels answer an empty body for "no items"
  try { return JSON.parse(trimmed) as T; }
  catch { throw new ProviderError('bad_response', 'provider did not return JSON'); }
}

export const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();
export const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
export const yearOf = (v: unknown): number | null => {
  const m = /(19|20)\d{2}/.exec(str(v));
  return m ? Number(m[0]) : null;
};
export const asArray = <T = unknown>(v: unknown): T[] =>
  Array.isArray(v) ? (v as T[]) : (v && typeof v === 'object' ? (Object.values(v) as T[]) : []);
/** Only http(s) image URLs reach the UI. */
export const imageUrl = (v: unknown): string => {
  const s = str(v);
  return /^https?:\/\//i.test(s) ? s : '';
};
export const safeExt = (v: unknown, fallback: string): string => {
  const s = str(v).toLowerCase().replace(/^\./, '');
  return /^[a-z0-9]{2,5}$/.test(s) ? s : fallback;
};
