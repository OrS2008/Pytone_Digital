// Parental controls — PIN-protected profiles, content rating cap, kids
// profile, channel block list, sign-out timer.
import Shell from '../Shell';

export default function Parental() {
  return (
    <Shell active="parental">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Parental controls</div>
        <h1 className="ac-panel-title">Family settings</h1>
        <p className="ac-panel-sub">
          Set a PIN to gate adult content, create a Kids profile, and block specific channels.
          Available on the Multi plan with up to 6 profiles per account.
        </p>
      </header>

      <div className="ac-card">
        <div className="ac-card-title">PIN</div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Require PIN for adult content</div>
            <div className="ac-toggle-desc">Anything rated 18+ (TV-MA, R, NC-17) prompts for a 4-digit PIN.</div>
          </div>
          <div className="ac-toggle ac-toggle-on" />
        </div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Require PIN to leave the Kids profile</div>
            <div className="ac-toggle-desc">Stops kids switching profiles to access the full catalogue.</div>
          </div>
          <div className="ac-toggle ac-toggle-on" />
        </div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Require PIN to change subscription / billing</div>
            <div className="ac-toggle-desc">Prevents accidental upgrades / cancellations.</div>
          </div>
          <div className="ac-toggle ac-toggle-on" />
        </div>
        <button className="ac-btn" style={{ marginTop: 14 }}>Change PIN</button>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Content rating cap</div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Maximum rating allowed without PIN</div>
            <div className="ac-toggle-desc">Movies and TV beyond this rating require the PIN to open.</div>
          </div>
          <select className="ac-input" style={{ width: 220 }}>
            <option>16+ (TV-14 / PG-13)</option>
            <option>18+ (TV-MA / R)</option>
            <option>13+ (TV-PG)</option>
            <option>All ages</option>
          </select>
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Profiles · 2 / 4</div>
        <div className="ac-device">
          <div className="ac-device-icon" style={{ background: 'var(--ns-accent-soft)', color: 'var(--ns-accent)' }}>OS</div>
          <div className="ac-device-meta">
            <div className="ac-device-name">Or <span className="ac-device-tag">PRIMARY</span></div>
            <div className="ac-device-sub">Adult · all ratings · no PIN required for this profile</div>
          </div>
          <button className="ac-btn ac-btn-sm">Edit</button>
        </div>
        <div className="ac-device">
          <div className="ac-device-icon">🧒</div>
          <div className="ac-device-meta">
            <div className="ac-device-name">Kids</div>
            <div className="ac-device-sub">Kids profile · cap at PG · 22 channels visible · 90 min/day limit</div>
          </div>
          <button className="ac-btn ac-btn-sm">Edit</button>
        </div>
        <button className="ac-btn ac-btn-primary" style={{ marginTop: 14 }}>+ Add profile</button>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Channel block list</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, marginTop: 0 }}>
          Hide specific channels from this profile entirely (they don't appear in the rail or search).
        </p>
        <input className="ac-input" placeholder="Search and block channels…" />
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['Sport 18+', 'Adult Movies', 'Erotica HD'].map(n => (
            <div key={n} style={{
              padding: '6px 12px',
              background: 'var(--ns-bg-hover)',
              border: '1px solid var(--ns-border)',
              borderRadius: 999,
              fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {n} <span style={{ color: 'var(--ns-text-faint)' }}>×</span>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
