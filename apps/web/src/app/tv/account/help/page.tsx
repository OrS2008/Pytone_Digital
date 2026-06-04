'use client';

import { useState } from 'react';
import Link from 'next/link';
import Shell from '../Shell';
import ActionButton from '@/components/ui/ActionButton';
import { signOut } from '@/lib/session';

const LEGAL = [
  { label: 'Terms of service',     href: '/legal/terms'   },
  { label: 'Privacy policy',       href: '/legal/privacy' },
  { label: 'Cookies & tracking',   href: '/legal/privacy' },
  { label: 'Acceptable use',       href: '/legal/terms'   },
  { label: 'Open-source licences', href: '/legal/terms'   },
  { label: 'Refund policy',        href: '/legal/terms'   },
];

export default function Help() {
  const [confirming, setConfirming] = useState(false);
  const [deleted,    setDeleted]    = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exporting,  setExporting]  = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // GDPR Art. 15 / 20. Fetches the JSON dump from /api/privacy/export.
  // The endpoint sets Content-Disposition: attachment, so we drive a
  // hidden <a> click to make the browser save it under the right
  // filename. We can't just window.location.assign() because that
  // would replace the current page if the response failed.
  async function handleExport() {
    setExportError(null);
    setExporting(true);
    try {
      const r = await fetch('/api/privacy/export', { credentials: 'include' });
      if (r.status === 401) {
        setExportError('You need to sign in again to export your data.');
        return;
      }
      if (r.status === 503) {
        setExportError('Server storage is not configured yet. Ask the admin to bind the NOVA_KV namespace.');
        return;
      }
      if (!r.ok) {
        setExportError(`Export failed (${r.status}).`);
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nova-stream-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke after the browser has a chance to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setExportError(`Export failed: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  // GDPR Art. 17. Wipes the user record, settings blob, and current
  // session server-side. The server also clears the ns_session cookie.
  // On success we drop our client-side session pointer too and bounce
  // to /tv/login so the next paint can't accidentally read stale
  // localStorage as if the user were still signed in.
  async function handleDelete() {
    setDeleteError(null);
    setConfirming(false);
    try {
      const r = await fetch('/api/privacy/delete', {
        method: 'POST',
        credentials: 'include',
      });
      if (r.status === 401) {
        setDeleteError('You need to sign in again before deleting your account.');
        return;
      }
      if (r.status === 503) {
        setDeleteError('Server storage is not configured yet. Ask the admin to bind the NOVA_KV namespace.');
        return;
      }
      if (!r.ok) {
        setDeleteError(`Delete failed (${r.status}).`);
        return;
      }
      setDeleted(true);
      // signOut() clears local session and navigates to /tv/login.
      // Fire after a short pause so the user sees the SCHEDULED chip.
      setTimeout(() => { signOut(); }, 1200);
    } catch (err) {
      setDeleteError(`Delete failed: ${(err as Error).message}`);
    }
  }

  return (
    <Shell active="help">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Help &amp; legal</div>
        <h1 className="ac-panel-title">We're here when you need us</h1>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }} className="ac-help-grid">
        <div className="ac-card">
          <div className="ac-card-title">Get support</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <ActionButton className="ac-btn" doneLabel="Opening help centre…">📚  Help centre &amp; FAQs</ActionButton>
            <ActionButton className="ac-btn" doneLabel="Connecting to chat…">💬  Live chat (24/7)</ActionButton>
            <a className="ac-btn" href="mailto:support@novastream.tv">✉️  support@novastream.tv</a>
            <ActionButton className="ac-btn" doneLabel="Opening X…">🐦  @NovaStreamHelp on X</ActionButton>
          </div>
        </div>
        <div className="ac-card">
          <div className="ac-card-title">Diagnostics</div>
          <dl className="ac-detail">
            <dt>App version</dt><dd>1.0.0</dd>
            <dt>Device</dt><dd>Web browser</dd>
            <dt>Region</dt><dd>Auto</dd>
          </dl>
          <ActionButton
            className="ac-btn ac-btn-sm"
            style={{ marginTop: 14 }}
            doneLabel="Copied ✓"
            onAction={() => {
              navigator.clipboard?.writeText(
                `Nova Stream · 1.0.0\nUser agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'}\nViewport: ${typeof window !== 'undefined' ? window.innerWidth + 'x' + window.innerHeight : 'unknown'}`,
              );
            }}
          >Copy diagnostics</ActionButton>
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Legal</div>
        {LEGAL.map((it, i) => (
          <Link key={it.label} href={it.href} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 0', borderTop: i === 0 ? '0' : '1px solid var(--ns-hairline)',
            color: 'var(--ns-text)', textDecoration: 'none',
          }}>
            <span>{it.label}</span>
            <span style={{ color: 'var(--ns-text-faint)' }}>›</span>
          </Link>
        ))}
      </div>

      <div className="ac-card ac-btn-danger" style={{ borderRadius: 14 }}>
        <div className="ac-card-title" style={{ color: 'inherit' }}>Danger zone</div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Export my data</div>
            <div className="ac-toggle-desc">
              Downloads a JSON file with every piece of personal data we hold on you —
              account, settings, watch history, recordings index. GDPR Articles 15 &amp; 20.
            </div>
            {exportError && (
              <div style={{ color: 'var(--ns-danger, #FF6B7B)', fontSize: 12, marginTop: 6 }}>
                {exportError}
              </div>
            )}
          </div>
          <button
            type="button"
            className="ac-btn ac-btn-sm"
            disabled={exporting}
            onClick={handleExport}
          >
            {exporting ? 'Preparing…' : 'Download export'}
          </button>
        </div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Delete my account</div>
            <div className="ac-toggle-desc">
              {deleted
                ? 'Account deleted. You will be signed out in a moment.'
                : 'Permanently removes your account, settings, and recordings. Cannot be undone.'}
            </div>
            {deleteError && (
              <div style={{ color: 'var(--ns-danger, #FF6B7B)', fontSize: 12, marginTop: 6 }}>
                {deleteError}
              </div>
            )}
          </div>
          {deleted ? (
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'var(--ns-text-faint)' }}>DELETED</span>
          ) : confirming ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="ac-btn ac-btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
              <button className="ac-btn ac-btn-sm ac-btn-danger" onClick={handleDelete}>
                Yes, delete
              </button>
            </div>
          ) : (
            <button className="ac-btn ac-btn-sm ac-btn-danger" onClick={() => setConfirming(true)}>
              Start deletion
            </button>
          )}
        </div>
      </div>
    </Shell>
  );
}
