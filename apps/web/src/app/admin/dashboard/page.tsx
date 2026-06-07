'use client';

// Admin dashboard.
//
// Three tabs, all driven by real KV data via /api/admin/*:
//
//   * Overview — counters (total users, trialing, subscribed, expired),
//                operational health (KV configured, sessions count,
//                settings storage approx size).
//   * Users    — paginated table of every signed-up user with status
//                pill, days left, last login, and a delete button.
//   * System   — environment / binding diagnostics: which env vars are
//                present, which Cloudflare bindings, version info.
//
// The dashboard is the operator's view of the platform — it does not
// surface anything end-users would see. All data fetches go to
// /api/admin/* routes that gate on the ns_admin cookie.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Tab = 'overview' | 'users' | 'system' | 'catchup';

interface Whoami { ok: boolean; sub?: string; exp?: number }

interface Stats {
  users:    { total: number; trialing: number; subscribed: number; expired: number; complete: boolean };
  sessions: { total: number; complete: boolean };
  settings: { total: number; approxBytes: number; complete: boolean };
  budget:   { maxListCalls: number; callsUsed: number };
}

interface UserRow {
  userId:          string;
  email:           string;
  createdAt:       number;
  lastLoginAt:     number | null;
  trialEndsAt:     number;
  subscribedUntil: number;
  status:          'trial' | 'subscribed' | 'expired';
  daysLeft:        number;
}

interface UsersPage { users: UserRow[]; cursor: string | null; listComplete: boolean }

interface DiagInfo {
  bindings:   { NOVA_KV: boolean };
  envVars:    { ADMIN_USERNAME: boolean; ADMIN_PASSWORD_HASH: boolean; ADMIN_SESSION_SECRET: boolean; BREVO_API_KEY: boolean };
  app:        { version: string; commit: string | null };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
function formatDate(ts: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
         ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function AdminDashboard() {
  const router = useRouter();
  const [me,   setMe]   = useState<Whoami | null>(null);
  const [tab,  setTab]  = useState<Tab>('overview');

  useEffect(() => {
    fetch('/api/admin/whoami', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: Whoami) => {
        setMe(d);
        if (!d.ok) router.replace('/admin/login');
      })
      .catch(() => setMe({ ok: false }));
  }, [router]);

  async function signOut() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.replace('/admin/login');
  }

  const expIn = me?.exp ? Math.max(0, Math.round((me.exp * 1000 - Date.now()) / 60000)) : 0;

  return (
    <div className="adm-shell">
      <header className="adm-topbar">
        <span className="adm-brand">NOVA STREAM</span>
        <span className="adm-topbar-spacer" />
        <span className="adm-topbar-user">{me?.sub || '—'} · {expIn}m left</span>
        <button className="adm-btn adm-btn-ghost adm-btn-inline" onClick={signOut}>
          Sign out
        </button>
      </header>

      <div className="adm-body">
        <aside className="adm-side">
          <div className="adm-side-h">Operate</div>
          <button
            className={`adm-side-item ${tab === 'overview' ? 'adm-side-item-active' : ''}`}
            onClick={() => setTab('overview')}
          >📊 Overview</button>
          <button
            className={`adm-side-item ${tab === 'users' ? 'adm-side-item-active' : ''}`}
            onClick={() => setTab('users')}
          >👤 Users</button>
          <button
            className={`adm-side-item ${tab === 'system' ? 'adm-side-item-active' : ''}`}
            onClick={() => setTab('system')}
          >⚙️ System</button>
          <button
            className={`adm-side-item ${tab === 'catchup' ? 'adm-side-item-active' : ''}`}
            onClick={() => setTab('catchup')}
          >🔍 Catchup Probe</button>
        </aside>

        <main className="adm-main">
          {tab === 'overview' && <OverviewTab />}
          {tab === 'users'    && <UsersTab    />}
          {tab === 'system'   && <SystemTab   />}
          {tab === 'catchup'  && <CatchupTab  />}
        </main>
      </div>
    </div>
  );
}

// ─── Overview ──────────────────────────────────────────────────────

function OverviewTab() {
  const [stats, setStats]     = useState<Stats | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/stats', { cache: 'no-store' });
      if (r.status === 503) {
        const body = await r.json() as { hint?: string; error?: string };
        setError(body.hint || body.error || 'Storage not configured.');
        return;
      }
      if (!r.ok) {
        setError(`Failed to load stats (${r.status}).`);
        return;
      }
      setStats(await r.json() as Stats);
    } catch (e) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="adm-row-head">
        <h1 className="adm-h1">Overview</h1>
        <button className="adm-btn adm-btn-ghost adm-btn-inline" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {error && <div className="adm-err" style={{ marginBottom: 16 }}>{error}</div>}

      <section className="adm-grid">
        <Stat title="Total users"  value={stats?.users.total} note={stats && !stats.users.complete ? 'partial (page cap hit)' : 'live KV count'} />
        <Stat title="Trialing"     value={stats?.users.trialing} note="days remaining in trial > 0" tone="ok" />
        <Stat title="Subscribed"   value={stats?.users.subscribed} note="paid access active" tone="ok" />
        <Stat title="Expired"      value={stats?.users.expired} note="needs to subscribe" tone="warn" />
      </section>

      <section className="adm-grid">
        <Stat title="Active sessions" value={stats?.sessions.total}   note="30-day TTL per session" />
        <Stat title="Settings blobs"  value={stats?.settings.total}   note="one per user with synced prefs" />
        <Stat title="Settings size"   value={stats ? formatBytes(stats.settings.approxBytes) : undefined} note="sum across users" />
      </section>

      <section className="adm-card">
        <h2 className="adm-card-title">How to read these numbers</h2>
        <ul style={{ margin: 0, paddingLeft: 18, color: '#99A3B5', fontSize: 13, lineHeight: 1.7 }}>
          <li><b>Trialing</b> + <b>Subscribed</b> + <b>Expired</b> = <b>Total users</b>. Anything else means a KV row is corrupted.</li>
          <li><b>Active sessions</b> can exceed <b>Total users</b> when the same user is signed in from many devices.</li>
          <li><b>Settings size</b> drives KV storage cost. Cloudflare's free tier is 1 GB; you're at {stats ? `${((stats.settings.approxBytes / 1_073_741_824) * 100).toFixed(4)}%` : '—'} of it.</li>
        </ul>
      </section>
    </>
  );
}

function Stat({ title, value, note, tone }: { title: string; value: number | string | undefined; note?: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className={`adm-stat ${tone === 'ok' ? 'adm-stat-ok' : tone === 'warn' ? 'adm-stat-warn' : ''}`}>
      <div className="adm-stat-k">{title}</div>
      <div className="adm-stat-v">{value ?? '—'}</div>
      {note && <div className="adm-stat-d">{note}</div>}
    </div>
  );
}

// ─── Users ─────────────────────────────────────────────────────────

function UsersTab() {
  const [users,   setUsers]   = useState<UserRow[]>([]);
  const [cursor,  setCursor]  = useState<string | null>(null);
  const [done,    setDone]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy,    setBusy]    = useState<string | null>(null);
  const [query,   setQuery]   = useState('');

  const loadMore = useCallback(async (reset: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const qs = !reset && cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      const r  = await fetch(`/api/admin/users${qs}`, { cache: 'no-store' });
      if (!r.ok) {
        setError(`Failed to load users (${r.status}).`);
        return;
      }
      const body = await r.json() as UsersPage;
      setUsers((prev) => reset ? body.users : [...prev, ...body.users]);
      setCursor(body.cursor);
      setDone(body.listComplete);
    } catch (e) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  }, [cursor]);

  useEffect(() => { loadMore(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function deleteUser(email: string) {
    if (!confirm(`Permanently delete ${email}? Their settings and history will be removed.`)) return;
    setBusy(email);
    try {
      const r = await fetch(`/api/admin/users/${encodeURIComponent(email)}`, { method: 'DELETE' });
      if (!r.ok) {
        alert(`Delete failed (${r.status}).`);
        return;
      }
      setUsers((prev) => prev.filter((u) => u.email !== email));
    } finally { setBusy(null); }
  }

  const filtered = query.trim().length
    ? users.filter((u) => u.email.toLowerCase().includes(query.toLowerCase()))
    : users;

  return (
    <>
      <div className="adm-row-head">
        <h1 className="adm-h1">Users</h1>
        <input
          className="adm-input adm-input-inline"
          placeholder="Filter by email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="adm-btn adm-btn-ghost adm-btn-inline" onClick={() => loadMore(true)} disabled={loading}>
          {loading ? 'Loading…' : '↻ Reload'}
        </button>
      </div>

      {error && <div className="adm-err" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="adm-card adm-card-flush">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Signed up</th>
              <th>Last login</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading && (
              <tr><td colSpan={5} className="adm-table-empty">No users yet. The first signup will appear here.</td></tr>
            )}
            {filtered.map((u) => (
              <tr key={u.userId}>
                <td className="adm-table-mono">{u.email}</td>
                <td>{formatDate(u.createdAt)}</td>
                <td>{formatDate(u.lastLoginAt)}</td>
                <td>
                  <StatusPill status={u.status} daysLeft={u.daysLeft} />
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="adm-btn adm-btn-ghost adm-btn-sm adm-btn-danger"
                    disabled={busy === u.email}
                    onClick={() => deleteUser(u.email)}
                  >
                    {busy === u.email ? 'Deleting…' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!done && users.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button className="adm-btn adm-btn-ghost adm-btn-inline" onClick={() => loadMore(false)} disabled={loading}>
            {loading ? 'Loading…' : 'Load next 100'}
          </button>
        </div>
      )}
    </>
  );
}

function StatusPill({ status, daysLeft }: { status: 'trial' | 'subscribed' | 'expired'; daysLeft: number }) {
  if (status === 'subscribed') return <span className="adm-pill adm-pill-ok">SUBSCRIBED</span>;
  if (status === 'expired')    return <span className="adm-pill adm-pill-warn">EXPIRED</span>;
  return <span className="adm-pill adm-pill-mut">TRIAL · {daysLeft}d</span>;
}

// ─── System ────────────────────────────────────────────────────────

function SystemTab() {
  const [diag, setDiag] = useState<DiagInfo | null>(null);
  const [err,  setErr]  = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/diag', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) { setErr(`Diag failed (${r.status})`); return; }
        setDiag(await r.json() as DiagInfo);
      })
      .catch((e: Error) => setErr(e.message));
  }, []);

  return (
    <>
      <h1 className="adm-h1">System</h1>
      {err && <div className="adm-err" style={{ marginBottom: 16 }}>{err}</div>}

      <section className="adm-card">
        <h2 className="adm-card-title">Cloudflare bindings</h2>
        <DiagRow ok={diag?.bindings.NOVA_KV} label="NOVA_KV (KV namespace)" hint={diag?.bindings.NOVA_KV ? 'Wired through wrangler.toml.' : 'Add the binding in wrangler.toml or the Pages dashboard.'} />
      </section>

      <section className="adm-card">
        <h2 className="adm-card-title">Environment</h2>
        <DiagRow ok={diag?.envVars.ADMIN_USERNAME}      label="ADMIN_USERNAME"      hint="From wrangler.toml [vars]." />
        <DiagRow ok={diag?.envVars.ADMIN_PASSWORD_HASH} label="ADMIN_PASSWORD_HASH" hint="Secret · Cloudflare Pages dashboard." />
        <DiagRow ok={diag?.envVars.ADMIN_SESSION_SECRET}label="ADMIN_SESSION_SECRET"hint="Secret · Cloudflare Pages dashboard." />
        <DiagRow ok={diag?.envVars.BREVO_API_KEY}       label="BREVO_API_KEY"       hint="Secret · used by /api/email/activate + /api/auth/forgot-password. Sender domain must be verified in Brevo." />
      </section>

      <section className="adm-card">
        <h2 className="adm-card-title">Build</h2>
        <dl className="adm-detail">
          <dt>App version</dt><dd>{diag?.app.version ?? '—'}</dd>
          <dt>Commit</dt><dd className="adm-table-mono">{diag?.app.commit ?? '—'}</dd>
        </dl>
      </section>
    </>
  );
}

function DiagRow({ ok, label, hint }: { ok: boolean | undefined; label: string; hint: string }) {
  return (
    <div className="adm-row">
      <span>{label}</span>
      <span>
        {ok === undefined
          ? <span className="adm-pill adm-pill-mut">CHECKING</span>
          : ok
            ? <span className="adm-pill adm-pill-ok">OK</span>
            : <span className="adm-pill adm-pill-warn">MISSING</span>}
      </span>
      <span style={{ color: '#5E6878', fontSize: 12 }}>{hint}</span>
    </div>
  );
}

// ─── Catchup Probe ─────────────────────────────────────────────────
//
// Operator-facing diagnostic that walks every catch-up URL candidate
// the player would try against the user's IPTV provider and reports
// what the upstream actually returns for each. Use it to figure out
// which URL shape a panel supports without reading network logs.

interface ProbeResult {
  candidate:    string;
  status:       number | null;
  contentType:  string | null;
  bodyPreview:  string | null;
  isManifest:   boolean;
  hasSegments:  boolean | null;
  error:        string | null;
  durationMs:   number;
}
interface ProbeResponse {
  parsed?:  { base: string; stream: string; playlist: string };
  results:  ProbeResult[];
  verdict?: { firstWorking: string | null; candidatesLikelyLive: string[] };
  error?:   string;
  hint?:    string;
}

function defaultStartUnix(): number {
  // 2 hours ago, rounded down to the previous full hour. Most providers
  // serve catch-up starting at the top of the hour, so this default
  // hits an actual programme boundary.
  const now = Math.floor(Date.now() / 1000);
  const twoHoursAgo = now - 2 * 3600;
  return twoHoursAgo - (twoHoursAgo % 3600);
}

function CatchupTab() {
  const [streamUrl,   setStreamUrl]   = useState('');
  const [startUnix,   setStartUnix]   = useState<number>(defaultStartUnix());
  const [durationMin, setDurationMin] = useState<number>(60);
  const [resp,        setResp]        = useState<ProbeResponse | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [busy,        setBusy]        = useState(false);

  // Convenience: render the unix seconds as a datetime-local input
  // string in the browser's local time. The probe takes seconds so we
  // convert back on submit.
  const startLocal = (() => {
    const d = new Date(startUnix * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResp(null);
    if (!streamUrl.trim()) { setError('Enter a stream URL.'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/admin/catchup-probe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ streamUrl: streamUrl.trim(), startUnix, durationMin }),
      });
      const body = await r.json() as ProbeResponse;
      if (!r.ok) {
        setError(body.hint || body.error || `Probe failed (${r.status}).`);
        return;
      }
      setResp(body);
    } catch (err) {
      setError(`Network error: ${(err as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <>
      <h1 className="adm-h1">Catchup Probe</h1>
      <p style={{ color: '#99A3B5', fontSize: 13.5, margin: '0 0 22px', lineHeight: 1.6 }}>
        Paste any live channel URL from a user&apos;s playlist and pick the
        target programme&apos;s start time. We&apos;ll walk every catch-up URL
        shape the player would try and report what the upstream returns
        for each — HTTP status, content type, and whether the body is a
        usable HLS manifest. Use this to figure out which URL pattern a
        provider supports without reading network logs in the player.
      </p>

      <form className="adm-card" onSubmit={run}>
        <div className="adm-field">
          <label className="adm-label">Live stream URL</label>
          <input
            className="adm-input"
            type="url"
            placeholder="http://provider.tv:1600/s/TOKEN/channel-slug/video.m3u8"
            value={streamUrl}
            onChange={(e) => setStreamUrl(e.target.value)}
            required
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div className="adm-field">
            <label className="adm-label">Programme start (local)</label>
            <input
              className="adm-input"
              type="datetime-local"
              value={startLocal}
              onChange={(e) => {
                const v = new Date(e.target.value);
                if (!isNaN(v.getTime())) setStartUnix(Math.floor(v.getTime() / 1000));
              }}
              required
            />
          </div>
          <div className="adm-field">
            <label className="adm-label">Duration (min)</label>
            <input
              className="adm-input"
              type="number" min={1} max={720}
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value) || 60)}
              required
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button type="submit" className="adm-btn adm-btn-inline" disabled={busy}>
            {busy ? 'Probing…' : 'Run probe'}
          </button>
          {error && <span style={{ color: '#FFB0B3', fontSize: 13 }}>{error}</span>}
        </div>
      </form>

      {resp && <CatchupResults resp={resp} />}
    </>
  );
}

function CatchupResults({ resp }: { resp: ProbeResponse }) {
  const working = resp.verdict?.firstWorking;
  return (
    <>
      <section className="adm-card" style={{ marginTop: 14 }}>
        <h2 className="adm-card-title">Verdict</h2>
        {working ? (
          <div style={{ fontSize: 14, color: '#7DF9C6' }}>
            ✓ At least one candidate returned a real archive manifest. Use this URL pattern as the catch-up template:
            <div className="adm-table-mono" style={{
              marginTop: 8, padding: 10, background: '#06080D', borderRadius: 8,
              wordBreak: 'break-all', fontSize: 12, lineHeight: 1.5,
            }}>{working}</div>
          </div>
        ) : (
          <div style={{ fontSize: 14, color: '#FFB020' }}>
            ⚠ No candidate returned a manifest with segments. The provider may not support
            archive on this channel, the token may not cover archive paths, or the time window
            may be outside their retention period.
          </div>
        )}
        {resp.verdict && resp.verdict.candidatesLikelyLive.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#FFB020' }}>
            ⚠ {resp.verdict.candidatesLikelyLive.length} candidate(s) returned a 200 + manifest
            but with no segments — likely the live stream silently served instead of an archive.
          </div>
        )}
      </section>

      <section className="adm-card adm-card-flush" style={{ marginTop: 14 }}>
        <table className="adm-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Candidate</th>
              <th>Status</th>
              <th>Verdict</th>
              <th>Latency</th>
            </tr>
          </thead>
          <tbody>
            {resp.results.map((r, i) => (
              <CatchupRow key={i} idx={i + 1} r={r} />
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function CatchupRow({ idx, r }: { idx: number; r: ProbeResult }) {
  let pill: { label: string; className: string };
  if (r.error)                                       pill = { label: 'ERROR',   className: 'adm-pill-warn' };
  else if (r.status === null)                        pill = { label: '—',       className: 'adm-pill-mut' };
  else if (r.status >= 200 && r.status < 300 && r.isManifest && r.hasSegments)
                                                     pill = { label: 'ARCHIVE', className: 'adm-pill-ok' };
  else if (r.status >= 200 && r.status < 300 && r.isManifest && !r.hasSegments)
                                                     pill = { label: 'LIVE?',   className: 'adm-pill-warn' };
  else if (r.status >= 200 && r.status < 300)        pill = { label: 'NON-HLS', className: 'adm-pill-warn' };
  else if (r.status === 404)                         pill = { label: '404',     className: 'adm-pill-mut' };
  else                                               pill = { label: String(r.status), className: 'adm-pill-warn' };

  return (
    <tr>
      <td style={{ color: '#5E6878', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{idx}</td>
      <td>
        <div className="adm-table-mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{r.candidate}</div>
        {r.bodyPreview && (
          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: 'pointer', fontSize: 11, color: '#5E6878' }}>body preview</summary>
            <pre style={{
              margin: '6px 0 0',
              padding: 8,
              background: '#06080D',
              borderRadius: 6,
              fontSize: 11,
              color: '#99A3B5',
              maxHeight: 180,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>{r.bodyPreview}</pre>
          </details>
        )}
        {r.error && (
          <div style={{ marginTop: 6, fontSize: 11, color: '#FFB0B3' }}>{r.error}</div>
        )}
      </td>
      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{r.status ?? '—'}</td>
      <td><span className={`adm-pill ${pill.className}`}>{pill.label}</span></td>
      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#5E6878' }}>{r.durationMs}ms</td>
    </tr>
  );
}
