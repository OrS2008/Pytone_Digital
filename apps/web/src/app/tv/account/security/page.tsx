// Security — change password, 2FA, login history.
'use client';

import { useState } from 'react';
import Shell from '../Shell';
import ActionButton from '@/components/ui/ActionButton';

const HISTORY = [
  { event: 'Sign-in',        meta: 'iPhone 15 Pro · Tel Aviv',         time: 'Just now',            ok: true  },
  { event: 'Sign-in',        meta: 'LG OLED C3 · Same network',        time: 'Today, 18:42',        ok: true  },
  { event: 'Password change',meta: 'MacBook Pro 14"',                  time: 'Yesterday, 22:15',    ok: true  },
  { event: 'Failed sign-in', meta: 'Unknown Linux · 185.220.101.42',   time: 'May 19, 03:21',       ok: false },
  { event: 'Sign-in',        meta: 'MacBook Pro 14"',                  time: 'May 18, 21:08',       ok: true  },
];

export default function Security() {
  const [current, setCurrent] = useState('');
  const [next, setNext]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg]         = useState<{ ok: boolean; text: string } | null>(null);

  function updatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (current.length < 1)      return setMsg({ ok: false, text: 'Enter your current password.' });
    if (next.length < 10)        return setMsg({ ok: false, text: 'New password must be at least 10 characters.' });
    if (next !== confirm)        return setMsg({ ok: false, text: 'New passwords do not match.' });
    if (current === next)        return setMsg({ ok: false, text: 'New password must differ from the current one.' });
    setMsg({ ok: true, text: 'Password updated.' });
    setCurrent(''); setNext(''); setConfirm('');
  }

  return (
    <Shell active="security">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Security</div>
        <h1 className="ac-panel-title">Sign-in & password</h1>
        <p className="ac-panel-sub">
          Strong passwords (10+ characters) and two-factor authentication are the
          best defences against account takeover.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }} className="ac-security-grid">
        <div className="ac-card">
          <div className="ac-card-title">Change password</div>
          <form onSubmit={updatePassword}>
            <div className="ac-field">
              <label className="ac-field-label">Current password</label>
              <input
                type="password" className="ac-input"
                placeholder="••••••••••"
                value={current} onChange={(e) => setCurrent(e.target.value)}
              />
            </div>
            <div className="ac-field">
              <label className="ac-field-label">New password</label>
              <input
                type="password" className="ac-input"
                placeholder="At least 10 characters"
                value={next} onChange={(e) => setNext(e.target.value)}
              />
              <div className="ac-field-help">We check against a database of leaked passwords. 10+ chars beats complexity.</div>
            </div>
            <div className="ac-field">
              <label className="ac-field-label">Confirm new password</label>
              <input
                type="password" className="ac-input"
                placeholder="••••••••••"
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {msg && (
              <div style={{
                fontSize: 13,
                padding: '8px 0',
                color: msg.ok ? 'var(--ns-ok, #7DF9C6)' : 'var(--ns-danger, #FF6B7B)',
              }}>{msg.text}</div>
            )}
            <button type="submit" className="ac-btn ac-btn-primary">Update password</button>
          </form>
        </div>

        <div className="ac-card">
          <div className="ac-card-title">Two-factor authentication</div>
          <div className="ac-toggle-row">
            <div>
              <div className="ac-toggle-title">Authenticator app</div>
              <div className="ac-toggle-desc">Time-based one-time codes via Google Authenticator, Authy, 1Password.</div>
            </div>
            <ActionButton doneLabel="Setup started ✓">Set up</ActionButton>
          </div>
          <div className="ac-toggle-row">
            <div>
              <div className="ac-toggle-title">SMS backup</div>
              <div className="ac-toggle-desc">Phone-number fallback. Less secure than app-based.</div>
            </div>
            <ActionButton doneLabel="Sent ✓">Configure</ActionButton>
          </div>
          <div className="ac-toggle-row">
            <div>
              <div className="ac-toggle-title">Passkey (WebAuthn)</div>
              <div className="ac-toggle-desc">Face ID / Touch ID / Windows Hello. No password required for trusted devices.</div>
            </div>
            <ActionButton doneLabel="Added ✓">Add passkey</ActionButton>
          </div>
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Recent activity</div>
        {HISTORY.map((h, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '24px 1fr 200px 80px',
            gap: 16, padding: '12px 0', alignItems: 'center',
            borderTop: i === 0 ? '0' : '1px solid var(--ns-hairline)',
            fontSize: 14,
          }}>
            <span style={{ color: 'var(--ns-text-faint)' }}>{h.ok ? '◯' : '⚠'}</span>
            <div>
              <div style={{ color: 'var(--ns-text)' }}>{h.event}</div>
              <div style={{ color: 'var(--ns-text-faint)', fontSize: 12 }}>{h.meta}</div>
            </div>
            <div style={{ color: 'var(--ns-text-muted)', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{h.time}</div>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 1,
              color: h.ok ? 'var(--ns-ok)' : '#FF6B7B',
            }}>
              {h.ok ? 'SUCCESS' : 'BLOCKED'}
            </div>
          </div>
        ))}
        <div style={{ marginTop: 14 }}>
          <ActionButton className="ac-auth-link" style={{
            background: 'none', border: 0, padding: 0, fontWeight: 600,
          }} doneLabel="Loaded ✓">View full history →</ActionButton>
        </div>
      </div>
    </Shell>
  );
}
