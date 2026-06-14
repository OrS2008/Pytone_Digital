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

type Tab = 'overview' | 'users' | 'system';

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
  envVars:    { ADMIN_USERNAME: boolean; ADMIN_PASSWORD_HASH: boolean; ADMIN_SESSION_SECRET: boolean; FIREBASE_API_KEY: boolean };
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
        </aside>

        <main className="adm-main">
          {tab === 'overview' && <OverviewTab />}
          {tab === 'users'    && <UsersTab    />}
          {tab === 'system'   && <SystemTab   />}
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
  const [editing, setEditing] = useState<UserRow | null>(null);

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
                    className="adm-btn adm-btn-ghost adm-btn-sm"
                    style={{ marginInlineEnd: 8 }}
                    onClick={() => setEditing(u)}
                  >
                    Manage
                  </button>
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

      {editing && (
        <ManageAccessModal
          user={editing}
          onClose={() => setEditing(null)}
          onUpdated={(updated) => {
            setUsers((prev) => prev.map((u) => u.email === updated.email ? { ...u, ...updated } : u));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function StatusPill({ status, daysLeft }: { status: 'trial' | 'subscribed' | 'expired'; daysLeft: number }) {
  if (status === 'subscribed') return <span className="adm-pill adm-pill-ok">SUBSCRIBED</span>;
  if (status === 'expired')    return <span className="adm-pill adm-pill-warn">EXPIRED</span>;
  return <span className="adm-pill adm-pill-mut">TRIAL · {daysLeft}d</span>;
}

// ─── ManageAccessModal ─────────────────────────────────────────────
// Lets the admin: extend a trial by N days, grant N days of paid
// subscription, cancel a paid subscription, or reset a trial. Each
// action is one POST to /api/admin/users/<email>/access; the row in
// the parent table refreshes optimistically with the server's reply.
function ManageAccessModal({
  user, onClose, onUpdated,
}: {
  user: UserRow;
  onClose: () => void;
  onUpdated: (u: Pick<UserRow, 'email' | 'status' | 'daysLeft' | 'trialEndsAt' | 'subscribedUntil'>) => void;
}) {
  const [trialDays,  setTrialDays]  = useState<number>(7);
  const [subDays,    setSubDays]    = useState<number>(30);
  const [busy,       setBusy]       = useState<string | null>(null);
  const [err,        setErr]        = useState<string | null>(null);

  async function call(body: Record<string, unknown>, label: string) {
    setBusy(label); setErr(null);
    try {
      const r = await fetch(
        `/api/admin/users/${encodeURIComponent(user.email)}/access`,
        {
          method:  'PATCH',
          headers: { 'content-type': 'application/json' },
          body:    JSON.stringify(body),
        },
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(typeof data.error === 'string' ? data.error : `HTTP ${r.status}`);
        return;
      }
      onUpdated({
        email:           user.email,
        status:          data.status,
        daysLeft:        data.daysLeft,
        trialEndsAt:     data.trialEndsAt,
        subscribedUntil: data.subscribedUntil,
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(null); }
  }

  return (
    <div
      className="adm-modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="adm-modal">
        <div className="adm-modal-head">
          <div>
            <h2 className="adm-modal-title">Manage access</h2>
            <div className="adm-modal-sub">{user.email}</div>
          </div>
          <button className="adm-btn adm-btn-ghost adm-btn-sm" onClick={onClose}>Close</button>
        </div>

        <div className="adm-modal-row" style={{ alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#9AA3B5', fontSize: 13 }}>Current status</span>
          <StatusPill status={user.status} daysLeft={user.daysLeft} />
          {user.subscribedUntil > 0 && (
            <span style={{ color: '#9AA3B5', fontSize: 12 }}>
              · paid through {formatDate(user.subscribedUntil)}
            </span>
          )}
        </div>

        {err && <div className="adm-err" style={{ marginTop: 12 }}>{err}</div>}

        {/* Trial controls -------------------------------------------- */}
        <fieldset className="adm-modal-card">
          <legend>Trial</legend>
          <p className="adm-modal-help">
            Extend by setting how many days of free access the user
            should have from <b>right now</b>. Use Reset to restart a
            fresh 7-day window.
          </p>
          <div className="adm-modal-row">
            <input
              className="adm-input"
              type="number" min={1} max={3650}
              value={trialDays}
              onChange={(e) => setTrialDays(Math.max(1, Math.min(3650, Number(e.target.value) || 1)))}
              style={{ width: 100 }}
            /> <span>days</span>
            <button
              className="adm-btn adm-btn-primary adm-btn-sm"
              disabled={!!busy}
              onClick={() => call({ action: 'extendTrial', days: trialDays }, 'extend')}
            >{busy === 'extend' ? '…' : `Extend trial → ${trialDays}d`}</button>
            <button
              className="adm-btn adm-btn-ghost adm-btn-sm"
              disabled={!!busy}
              onClick={() => call({ action: 'resetTrial' }, 'reset')}
            >{busy === 'reset' ? '…' : 'Reset to 7d'}</button>
          </div>
        </fieldset>

        {/* Subscription controls ------------------------------------- */}
        <fieldset className="adm-modal-card">
          <legend>Subscription</legend>
          <p className="adm-modal-help">
            Grant paid access on top of any existing window (good for
            comp days). Cancel zeroes the paid window — the user falls
            back to trial if it still has time, otherwise to expired.
          </p>
          <div className="adm-modal-row">
            <input
              className="adm-input"
              type="number" min={1} max={3650}
              value={subDays}
              onChange={(e) => setSubDays(Math.max(1, Math.min(3650, Number(e.target.value) || 1)))}
              style={{ width: 100 }}
            /> <span>days</span>
            <button
              className="adm-btn adm-btn-primary adm-btn-sm"
              disabled={!!busy}
              onClick={() => call({ action: 'grantSubscription', days: subDays }, 'grant')}
            >{busy === 'grant' ? '…' : `Grant +${subDays}d paid`}</button>
            <button
              className="adm-btn adm-btn-ghost adm-btn-sm adm-btn-danger"
              disabled={!!busy || user.subscribedUntil === 0}
              onClick={() => call({ action: 'cancelSubscription' }, 'cancel')}
            >{busy === 'cancel' ? '…' : 'Cancel subscription'}</button>
          </div>
        </fieldset>
      </div>
    </div>
  );
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
        <DiagRow ok={diag?.envVars.FIREBASE_API_KEY}    label="FIREBASE_API_KEY"    hint="Web SDK key · used by /api/auth/signup, /login, /forgot-password. Configure email templates in Firebase Console → Authentication." />
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

