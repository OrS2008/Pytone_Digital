// Per-channel playback health, learned from real playback attempts.
//
// IPTV playlists rot. Providers retire streams, re-key them, or point
// at a CDN that has stopped answering — but the M3U keeps listing them,
// so the user scrolls past channels that can never play. This module
// remembers which channels actually failed, hides the ones that keep
// failing, and puts them back the moment they work again.
//
// The design is deliberately cautious, because the cost of a false
// positive is high: a hidden channel is one the user cannot find at
// all. Three rules keep that from happening.
//
//   1. Evidence, not a single error. A channel is hidden only after
//      FAIL_THRESHOLD separate failures. One bad night on a mobile
//      connection is not a dead stream.
//   2. Success always wins. Any successful playback clears the record
//      outright — not decrements it — so a channel that recovers is
//      back immediately and starts from a clean slate.
//   3. Nothing disappears silently. hiddenIds() is surfaced in the UI
//      with a live count and a one-click restore, and the whole
//      behaviour sits behind a preference the user can switch off.
//
// Health is per-tenant and deliberately NOT synced across devices: a
// stream can be blocked on one network and fine on another (carrier
// blocks, geo-routing, an ISP with a broken route to the provider's
// CDN), so one device's verdict should not silence a channel on
// another.

import { userKey } from './session';

const KEY = 'channelHealth';

// How many failures before a channel is hidden.
export const FAIL_THRESHOLD = 3;

// A failure record older than this is discarded on read. Providers fix
// things; a channel that failed a fortnight ago deserves another try
// even if nobody has explicitly re-probed it.
const RECORD_TTL_MS = 14 * 24 * 60 * 60_000;

export interface HealthRecord {
  /** Consecutive failures since the last success. */
  fails: number;
  /** When the most recent failure happened (epoch ms). */
  lastFailAt: number;
  /** Last time a probe / playback confirmed the stream works. */
  lastOkAt: number;
}

type Store = Record<string, HealthRecord>;
type Listener = () => void;

const listeners = new Set<Listener>();

function read(): Store {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(userKey(KEY));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    // Drop stale records on the way through so the store self-prunes
    // and long-gone channels don't stay condemned forever.
    const now = Date.now();
    const out: Store = {};
    for (const [id, rec] of Object.entries(parsed)) {
      if (!rec || typeof rec.fails !== 'number') continue;
      const seen = Math.max(rec.lastFailAt || 0, rec.lastOkAt || 0);
      if (seen && now - seen > RECORD_TTL_MS) continue;
      out[id] = rec;
    }
    return out;
  } catch { return {}; }
}

function write(store: Store): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(userKey(KEY), JSON.stringify(store)); }
  catch { /* quota — health is best-effort, never block playback for it */ }
  listeners.forEach((l) => { try { l(); } catch { /* a listener must not break the writer */ } });
}

/** Record that a channel played. Clears any failure history outright. */
export function reportOk(channelId: string): void {
  if (!channelId) return;
  const store = read();
  const prev = store[channelId];
  // Already recorded as healthy and nothing to forget — skip the write
  // so routine channel-surfing doesn't hit localStorage on every tune.
  if (prev && prev.fails === 0) return;
  store[channelId] = { fails: 0, lastFailAt: 0, lastOkAt: Date.now() };
  write(store);
}

/** Record a playback failure. Returns true if this crossed the threshold. */
export function reportFail(channelId: string): boolean {
  if (!channelId) return false;
  const store = read();
  const prev = store[channelId] ?? { fails: 0, lastFailAt: 0, lastOkAt: 0 };
  const rec: HealthRecord = {
    fails: prev.fails + 1,
    lastFailAt: Date.now(),
    lastOkAt: prev.lastOkAt,
  };
  store[channelId] = rec;
  write(store);
  return prev.fails < FAIL_THRESHOLD && rec.fails >= FAIL_THRESHOLD;
}

/** Ids that have failed often enough to be hidden. */
export function hiddenIds(): Set<string> {
  const out = new Set<string>();
  for (const [id, rec] of Object.entries(read())) {
    if (rec.fails >= FAIL_THRESHOLD) out.add(id);
  }
  return out;
}

export function getRecord(channelId: string): HealthRecord | null {
  return read()[channelId] ?? null;
}

/** Put a single channel back and forget its failures. */
export function restore(channelId: string): void {
  const store = read();
  if (!store[channelId]) return;
  delete store[channelId];
  write(store);
}

/** Put every hidden channel back. */
export function restoreAll(): void {
  write({});
}

export function onHealthChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ---------------------------------------------------------------------
// Re-probing
// ---------------------------------------------------------------------

// Probing asks the stream proxy for the channel's manifest and treats a
// 2xx as proof of life. We only ever probe channels that are ALREADY
// hidden — that set is small and bounded, whereas probing a whole
// playlist would mean thousands of upstream requests. A healthy channel
// needs no probe: it proves itself the next time it is played.

const PROBE_TIMEOUT_MS = 8_000;
const PROBE_CONCURRENCY = 4;
const PROBE_COOLDOWN_MS = 30 * 60_000;
const COOLDOWN_KEY = 'channelHealth.lastProbeAt';

function lastProbeAt(): number {
  if (typeof window === 'undefined') return 0;
  try { return Number(localStorage.getItem(userKey(COOLDOWN_KEY))) || 0; }
  catch { return 0; }
}

function markProbed(): void {
  try { localStorage.setItem(userKey(COOLDOWN_KEY), String(Date.now())); }
  catch { /* ignore */ }
}

export function probeDue(): boolean {
  return Date.now() - lastProbeAt() > PROBE_COOLDOWN_MS;
}

async function probeOne(t: ProbeTarget): Promise<boolean> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS);
  try {
    // Same-origin proxy so the provider's missing CORS headers and our
    // user-agent / client-IP forwarding all apply exactly as they do
    // during real playback — otherwise the probe would answer a
    // different question than the one we are asking.
    const r = await fetch(proxyUrlFor(t), { signal: ac.signal, cache: 'no-store' });
    if (!r.ok) return false;
    const body = await r.text();
    // A manifest that parses as HLS is proof the upstream is serving.
    // Some dead endpoints answer 200 with an error page, so check the
    // payload rather than trusting the status alone.
    return /^\s*#EXTM3U/m.test(body) || /#EXT-X-/m.test(body);
  } catch {
    return false; // abort / network error — still failing
  } finally {
    clearTimeout(timer);
  }
}

// Always the proxy path, never direct mode. A probe asks "is the
// upstream serving this manifest?", and in direct mode the browser
// would fetch it cross-origin and a missing CORS header would fail the
// request for a reason that has nothing to do with the stream's health.
function proxyUrlFor(t: ProbeTarget): string {
  let out = `/api/stream?url=${encodeURIComponent(t.streamUrl)}`;
  // Ask exactly the way playback asks. A channel whose provider gates
  // on User-Agent would fail every probe and never come back.
  if (t.httpUserAgent) out += `&ua=${encodeURIComponent(t.httpUserAgent)}`;
  if (t.httpReferrer)  out += `&ref=${encodeURIComponent(t.httpReferrer)}`;
  return out;
}

export interface ProbeTarget {
  id: string;
  streamUrl: string;
  httpUserAgent?: string;
  httpReferrer?: string;
}

export interface ProbeResult {
  checked:  number;
  restored: number;
}

// ---------------------------------------------------------------------
// Rolling background sweep
// ---------------------------------------------------------------------

// The passive detector only ever learns about channels the user opened.
// The sweep closes that gap by checking the playlist on its own — but it
// does so a slice at a time, advancing a cursor, rather than scanning
// everything on each pass.
//
// That shape is not a compromise on thoroughness, it is what makes the
// feature safe to run at all. These playlists carry ~12k channels, and a
// full scan every five minutes would mean ~144k upstream requests an
// hour against the provider. That is indistinguishable from scraping,
// and it is the sort of traffic IPTV resellers suspend accounts for. A
// rolling slice still reaches every channel; it just takes hours
// instead of minutes, and costs the provider almost nothing.
const SWEEP_BATCH = 25;
const SWEEP_CONCURRENCY = 3;
const CURSOR_KEY = 'channelHealth.sweepCursor';

// If nearly everything in a batch fails, the batch is not evidence about
// the channels — it is evidence about us. Wi-Fi dropped, the provider is
// rate-limiting the sweep, the whole account is suspended. Recording
// those failures would march the entire playlist to the hide threshold
// in a few passes and empty the channel list. Above this rate the batch
// is discarded.
const SWEEP_BAD_BATCH_RATE = 0.8;

function sweepCursor(): number {
  if (typeof window === 'undefined') return 0;
  try { return Number(localStorage.getItem(userKey(CURSOR_KEY))) || 0; }
  catch { return 0; }
}

function setSweepCursor(n: number): void {
  try { localStorage.setItem(userKey(CURSOR_KEY), String(n)); }
  catch { /* ignore */ }
}

export interface SweepResult {
  checked:   number;
  failed:    number;
  restored:  number;
  /** True when the batch was thrown away as a network-wide failure. */
  discarded: boolean;
  /** Position after this batch, for progress display. */
  cursor:    number;
  total:     number;
}

/**
 * Check the next slice of the playlist and fold the results into each
 * channel's health record. Wraps back to the start at the end, so
 * leaving the page open keeps re-verifying in the background.
 */
export async function sweepNextBatch(
  channels: ProbeTarget[],
  opts?: { batch?: number },
): Promise<SweepResult> {
  const total = channels.length;
  if (total === 0) return { checked: 0, failed: 0, restored: 0, discarded: false, cursor: 0, total: 0 };

  const size = Math.min(opts?.batch ?? SWEEP_BATCH, total);
  const start = sweepCursor() % total;
  const batch: ProbeTarget[] = [];
  for (let i = 0; i < size; i++) {
    const c = channels[(start + i) % total];
    if (c?.streamUrl) batch.push(c);
  }
  const nextCursor = (start + size) % total;
  setSweepCursor(nextCursor);
  if (batch.length === 0) {
    return { checked: 0, failed: 0, restored: 0, discarded: false, cursor: nextCursor, total };
  }

  const before = hiddenIds();
  const results: Array<{ t: ProbeTarget; ok: boolean }> = [];
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= batch.length) return;
      const t = batch[i];
      results.push({ t, ok: await probeOne(t) });
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(SWEEP_CONCURRENCY, batch.length) }, worker),
  );

  const failed = results.filter((r) => !r.ok).length;
  // Five is the smallest batch where a rate is meaningful; below that a
  // couple of genuinely dead channels would trip the guard.
  if (batch.length >= 5 && failed / batch.length >= SWEEP_BAD_BATCH_RATE) {
    return { checked: batch.length, failed, restored: 0, discarded: true, cursor: nextCursor, total };
  }

  for (const r of results) {
    if (r.ok) reportOk(r.t.id);
    else      reportFail(r.t.id);
  }
  const after = hiddenIds();
  let restored = 0;
  for (const id of before) if (!after.has(id)) restored += 1;
  return { checked: batch.length, failed, restored, discarded: false, cursor: nextCursor, total };
}

/**
 * Re-check hidden channels and restore the ones that respond.
 *
 * `force` skips the cooldown — used by the explicit "Recheck now"
 * button, where the user is waiting on an answer and a silent no-op
 * would read as the button being broken.
 */
export async function probeHidden(
  channels: ProbeTarget[],
  opts?: { force?: boolean; max?: number },
): Promise<ProbeResult> {
  if (!opts?.force && !probeDue()) return { checked: 0, restored: 0 };
  const hidden = hiddenIds();
  const targets = channels
    .filter((c) => hidden.has(c.id) && !!c.streamUrl)
    .slice(0, opts?.max ?? 40);
  markProbed();
  if (targets.length === 0) return { checked: 0, restored: 0 };

  let restored = 0;
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= targets.length) return;
      const t = targets[i];
      if (await probeOne(t)) {
        restore(t.id);
        restored += 1;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(PROBE_CONCURRENCY, targets.length) }, worker),
  );
  return { checked: targets.length, restored };
}
