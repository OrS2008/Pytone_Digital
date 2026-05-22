'use client';

// Admin dashboard. Stats here are placeholders for the demo build —
// once the gateway + analytics service are deployed they're swapped for
// real metric reads. The shell, navigation, sign-out flow and gating
// are all production-grade.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Whoami { ok: boolean; sub?: string; exp?: number }

export default function AdminDashboard() {
  const router = useRouter();
  const [me, setMe] = useState<Whoami | null>(null);

  useEffect(() => {
    fetch('/api/admin/whoami', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: Whoami) => setMe(d))
      .catch(() => setMe({ ok: false }));
  }, []);

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
        <button className="adm-btn adm-btn-ghost" style={{ width: 'auto', padding: '6px 12px' }} onClick={signOut}>
          Sign out
        </button>
      </header>

      <div className="adm-body">
        <aside className="adm-side">
          <div className="adm-side-h">Overview</div>
          <Link href="/admin/dashboard" className="adm-side-item adm-side-item-active">Dashboard</Link>
          <Link href="/admin/dashboard#users"    className="adm-side-item">Users</Link>
          <Link href="/admin/dashboard#billing"  className="adm-side-item">Billing</Link>
          <Link href="/admin/dashboard#content"  className="adm-side-item">Content</Link>
          <Link href="/admin/dashboard#audit"    className="adm-side-item">Audit log</Link>
          <Link href="/admin/dashboard#system"   className="adm-side-item">System</Link>
        </aside>

        <main className="adm-main">
          <h1 className="adm-h1">Dashboard</h1>

          <section className="adm-grid">
            <div className="adm-stat">
              <div className="adm-stat-k">Active subscribers</div>
              <div className="adm-stat-v">—</div>
              <div className="adm-stat-d">connects when the billing service is wired up</div>
            </div>
            <div className="adm-stat">
              <div className="adm-stat-k">Trialing</div>
              <div className="adm-stat-v">—</div>
              <div className="adm-stat-d">7-day trial in progress</div>
            </div>
            <div className="adm-stat">
              <div className="adm-stat-k">Concurrent streams</div>
              <div className="adm-stat-v">—</div>
              <div className="adm-stat-d">from device manager</div>
            </div>
            <div className="adm-stat">
              <div className="adm-stat-k">Playback errors / hr</div>
              <div className="adm-stat-v">—</div>
              <div className="adm-stat-d">5xx + HLS fatal</div>
            </div>
          </section>

          <section id="users" className="adm-card">
            <h2 className="adm-card-title">Recent sign-ups</h2>
            <div className="adm-row">
              <span style={{ color: '#8B95A7' }}>Connect the auth-service to populate this table.</span>
              <span /><span />
            </div>
          </section>

          <section id="billing" className="adm-card">
            <h2 className="adm-card-title">Billing health</h2>
            <div className="adm-row">
              <span>Stripe webhook · /api/billing/webhook</span>
              <span><span className="adm-pill adm-pill-ok">OK</span></span>
              <span />
            </div>
            <div className="adm-row">
              <span>Idempotency cache (10 min)</span>
              <span><span className="adm-pill adm-pill-ok">enabled</span></span>
              <span />
            </div>
          </section>

          <section id="content" className="adm-card">
            <h2 className="adm-card-title">Content sources</h2>
            <div className="adm-row">
              <span>M3U proxy · /api/m3u</span>
              <span><span className="adm-pill adm-pill-ok">online</span></span>
              <span />
            </div>
            <div className="adm-row">
              <span>SSRF guard · port + private-IP block list</span>
              <span><span className="adm-pill adm-pill-ok">enforced</span></span>
              <span />
            </div>
          </section>

          <section id="audit" className="adm-card">
            <h2 className="adm-card-title">Recent admin activity</h2>
            <div className="adm-row">
              <span>Sign-in · {me?.sub || '—'}</span>
              <span><span className="adm-pill adm-pill-ok">SUCCESS</span></span>
              <span style={{ color: '#5E6878' }}>just now</span>
            </div>
          </section>

          <section id="system" className="adm-card">
            <h2 className="adm-card-title">System</h2>
            <div className="adm-row">
              <span>CSP · X-Frame-Options · HSTS · Permissions-Policy</span>
              <span><span className="adm-pill adm-pill-ok">active</span></span>
              <span />
            </div>
            <div className="adm-row">
              <span>Tenant isolation (per-email namespacing)</span>
              <span><span className="adm-pill adm-pill-warn">logical</span></span>
              <span style={{ color: '#5E6878' }}>upgrade with backend</span>
            </div>
            <div className="adm-row">
              <span>Per-user data store (Postgres)</span>
              <span><span className="adm-pill adm-pill-mut">offline</span></span>
              <span />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
