'use client';

import { useState } from 'react';
import Link from 'next/link';
import Shell from '../Shell';
import ActionButton from '@/components/ui/ActionButton';

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
            <dt>App version</dt><dd>0.1.0 (web · build 5944509)</dd>
            <dt>Device</dt><dd>iPhone 15 Pro · iOS 19.1</dd>
            <dt>Network</dt><dd>Wi-Fi · 145 Mbps down</dd>
            <dt>Gateway</dt><dd>eu-west-1 · 27 ms p95</dd>
          </dl>
          <ActionButton
            className="ac-btn ac-btn-sm"
            style={{ marginTop: 14 }}
            doneLabel="Copied ✓"
            onAction={() => {
              navigator.clipboard?.writeText(
                'Nova Stream · 0.1.0 (web · build 5944509)\nDevice: iPhone 15 Pro · iOS 19.1\nNetwork: Wi-Fi · 145 Mbps\nGateway: eu-west-1 · 27 ms p95',
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
            <div className="ac-toggle-desc">Watch history, favourites, recordings index, profile — GDPR Article 20.</div>
          </div>
          <ActionButton doneLabel="Requested · check email">Request export</ActionButton>
        </div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Delete my account</div>
            <div className="ac-toggle-desc">
              {deleted
                ? 'Deletion scheduled. You will receive a confirmation email within 24 hours; access continues until then.'
                : 'Permanently removes the account + recordings + history within 30 days.'}
            </div>
          </div>
          {deleted ? (
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'var(--ns-text-faint)' }}>SCHEDULED</span>
          ) : confirming ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="ac-btn ac-btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
              <button className="ac-btn ac-btn-sm ac-btn-danger" onClick={() => { setConfirming(false); setDeleted(true); }}>
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
