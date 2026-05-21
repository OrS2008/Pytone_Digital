// Devices — shows currently-active sessions backed by DeviceManager
// (services/auth). Users on the Single plan can have 1 active; Multi up to
// 4. Each row supports Sign-out (releases the slot immediately).
import Shell from '../Shell';

const DEVICES = [
  { id: 'd1', icon: '📱', name: 'iPhone 15 Pro',     ip: '94.27.118.42',  loc: 'Tel Aviv, IL',  last: 'Active now',       active: true },
  { id: 'd2', icon: '📺', name: 'LG OLED C3 (TV)',   ip: '192.168.1.40',  loc: 'Same network',  last: '12 minutes ago',   active: false },
  { id: 'd3', icon: '💻', name: 'MacBook Pro 14"',   ip: '94.27.118.42',  loc: 'Tel Aviv, IL',  last: '2 hours ago',      active: false },
];

export default function Devices() {
  return (
    <Shell active="devices">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Devices</div>
        <h1 className="ac-panel-title">Manage signed-in devices</h1>
        <p className="ac-panel-sub">
          Your <strong style={{ color: 'var(--ns-text)' }}>Single</strong> plan allows
          1 device streaming at the same time. To stream from a second device,
          either sign out from an existing one or upgrade to{' '}
          <a href="/tv/account/plans" className="ac-auth-link">Multi (4 devices)</a>.
        </p>
      </header>

      <div className="ac-card">
        <div className="ac-card-title">
          Signed-in devices · {DEVICES.length}
        </div>
        {DEVICES.map((d) => (
          <div key={d.id} className={`ac-device ${d.active ? 'ac-device-active' : ''}`}>
            <div className="ac-device-icon">{d.icon}</div>
            <div className="ac-device-meta">
              <div className="ac-device-name">
                {d.name}
                {d.active && <span className="ac-device-tag">THIS DEVICE</span>}
              </div>
              <div className="ac-device-sub">
                {d.loc} · {d.ip} · {d.last}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {!d.active && <button className="ac-btn ac-btn-sm ac-btn-danger">Sign out</button>}
              {d.active  && <button className="ac-btn ac-btn-sm" disabled style={{ opacity: 0.5 }}>Current</button>}
            </div>
          </div>
        ))}
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Security alerts</div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Email me on every new sign-in</div>
            <div className="ac-toggle-desc">We'll send a notice when an unfamiliar device signs in. You can revoke from the email.</div>
          </div>
          <div className="ac-toggle ac-toggle-on" />
        </div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Auto-revoke devices unused for 60 days</div>
            <div className="ac-toggle-desc">Devices that haven't streamed in 60 days are signed out automatically.</div>
          </div>
          <div className="ac-toggle ac-toggle-on" />
        </div>
        <div style={{ marginTop: 16 }}>
          <button className="ac-btn ac-btn-danger">
            ⨂  Sign out from all devices
          </button>
        </div>
      </div>
    </Shell>
  );
}
