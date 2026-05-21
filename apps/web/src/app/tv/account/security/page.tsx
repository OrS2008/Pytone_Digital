// Security — change password, 2FA, login history.
import Shell from '../Shell';

const HISTORY = [
  { event: 'Sign-in',        meta: 'iPhone 15 Pro · Tel Aviv',         time: 'Just now',            ok: true  },
  { event: 'Sign-in',        meta: 'LG OLED C3 · Same network',        time: 'Today, 18:42',        ok: true  },
  { event: 'Password change',meta: 'MacBook Pro 14"',                  time: 'Yesterday, 22:15',    ok: true  },
  { event: 'Failed sign-in', meta: 'Unknown Linux · 185.220.101.42',   time: 'May 19, 03:21',       ok: false },
  { event: 'Sign-in',        meta: 'MacBook Pro 14"',                  time: 'May 18, 21:08',       ok: true  },
];

export default function Security() {
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div className="ac-card">
          <div className="ac-card-title">Change password</div>
          <div className="ac-field">
            <label className="ac-field-label">Current password</label>
            <input type="password" className="ac-input" placeholder="••••••••••" />
          </div>
          <div className="ac-field">
            <label className="ac-field-label">New password</label>
            <input type="password" className="ac-input" placeholder="At least 10 characters" />
            <div className="ac-field-help">We check against a database of leaked passwords. 10+ chars beats complexity.</div>
          </div>
          <div className="ac-field">
            <label className="ac-field-label">Confirm new password</label>
            <input type="password" className="ac-input" placeholder="••••••••••" />
          </div>
          <button className="ac-btn ac-btn-primary">Update password</button>
        </div>

        <div className="ac-card">
          <div className="ac-card-title">Two-factor authentication</div>
          <div className="ac-toggle-row">
            <div>
              <div className="ac-toggle-title">Authenticator app</div>
              <div className="ac-toggle-desc">Time-based one-time codes via Google Authenticator, Authy, 1Password.</div>
            </div>
            <button className="ac-btn ac-btn-sm">Set up</button>
          </div>
          <div className="ac-toggle-row">
            <div>
              <div className="ac-toggle-title">SMS backup</div>
              <div className="ac-toggle-desc">Phone-number fallback. Less secure than app-based.</div>
            </div>
            <button className="ac-btn ac-btn-sm">Configure</button>
          </div>
          <div className="ac-toggle-row">
            <div>
              <div className="ac-toggle-title">Passkey (WebAuthn)</div>
              <div className="ac-toggle-desc">Face ID / Touch ID / Windows Hello. No password required for trusted devices.</div>
            </div>
            <button className="ac-btn ac-btn-sm">Add passkey</button>
          </div>
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Recent activity</div>
        {HISTORY.map((h, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '24px 1fr 240px 80px',
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
          <a href="#" className="ac-auth-link">View full history →</a>
        </div>
      </div>
    </Shell>
  );
}
