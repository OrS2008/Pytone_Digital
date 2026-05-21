// Account overview — the landing card. Headline, trial countdown, quick
// stats, and shortcuts to the most-likely next actions.
import Shell from './Shell';

export default function AccountOverview() {
  return (
    <Shell active="overview">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Account</div>
        <h1 className="ac-panel-title">Hi, Or</h1>
        <p className="ac-panel-sub">Manage your subscription, devices and content sources from one place.</p>
      </header>

      <div className="ac-banner">
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
            Your trial ends in <span className="ac-banner-strong">5 days · 14 hours</span>
          </div>
          <div style={{ color: 'var(--ns-text-muted)', fontSize: 14 }}>
            Pick a plan before <strong style={{ color: 'var(--ns-text)' }}>May 26, 21:00</strong> to keep watching.
            No card needed during trial.
          </div>
        </div>
        <a href="/tv/account/plans" className="ac-btn ac-btn-primary">Choose a plan</a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
        <div>
          <div className="ac-card">
            <div className="ac-card-title">Account</div>
            <dl className="ac-detail">
              <dt>Full name</dt><dd>Or Shimon</dd>
              <dt>Email</dt><dd>ors2008@gmail.com <span className="ac-pill"><span className="ac-pill-dot" />verified</span></dd>
              <dt>Member since</dt><dd>14 May 2026</dd>
              <dt>Account ID</dt><dd style={{ fontFamily: 'var(--ns-font-mono)', fontSize: 13 }}>usr_8FQK29B4MNT</dd>
            </dl>
          </div>

          <div className="ac-card">
            <div className="ac-card-title">Content sources</div>
            <div className="ac-source">
              <div className="ac-source-icon">M3U</div>
              <div className="ac-source-meta">
                <div className="ac-source-title">My provider</div>
                <div className="ac-source-url">http://provider.example/get.php?username=••••&password=••••</div>
              </div>
              <div className="ac-source-stats">
                <div><span className="ac-source-stat-num">237</span> channels</div>
                <div><span className="ac-source-stat-num">14</span> categories</div>
              </div>
              <a href="/tv/account/sources" className="ac-btn ac-btn-sm">Manage</a>
            </div>
            <div className="ac-source">
              <div className="ac-source-icon" style={{ background: 'rgba(125,249,198,0.10)', color: 'var(--ns-ok)' }}>EPG</div>
              <div className="ac-source-meta">
                <div className="ac-source-title">Auto-EPG · IL</div>
                <div className="ac-source-url">epg.iptvx.one/IL.xml.gz</div>
              </div>
              <div className="ac-source-stats">
                <div><span className="ac-source-stat-num">231</span> channels matched</div>
                <div>refreshed 4h ago</div>
              </div>
              <a href="/tv/account/sources" className="ac-btn ac-btn-sm">Manage</a>
            </div>
            <div className="ac-source">
              <div className="ac-source-icon" style={{ background: 'rgba(139,92,246,0.14)', color: 'var(--ns-accent-2)' }}>VOD</div>
              <div className="ac-source-meta">
                <div className="ac-source-title">VOD · Movies + Series</div>
                <div className="ac-source-url">xtream://provider.example · Movies 14,210 · Series 2,890</div>
              </div>
              <div className="ac-source-stats">
                <div><span className="ac-source-stat-num">17,100</span> titles</div>
              </div>
              <a href="/tv/account/sources" className="ac-btn ac-btn-sm">Manage</a>
            </div>
          </div>
        </div>

        <div>
          <div className="ac-card">
            <div className="ac-card-title">Current plan</div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>Free Trial</div>
            <div style={{ color: 'var(--ns-text-muted)', fontSize: 14, marginTop: 4 }}>
              Single device · 5 days remaining
            </div>
            <a href="/tv/account/plans" style={{ display: 'block', marginTop: 16 }} className="ac-btn ac-btn-primary">
              See plans →
            </a>
          </div>
          <div className="ac-card">
            <div className="ac-card-title">Active devices</div>
            <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums' }}>
              1<span style={{ color: 'var(--ns-text-faint)', fontSize: 24, fontWeight: 500 }}> / 1</span>
            </div>
            <div style={{ color: 'var(--ns-text-muted)', fontSize: 14 }}>iPhone 15 Pro · Now</div>
            <a href="/tv/account/devices" style={{ display: 'block', marginTop: 16 }} className="ac-btn">
              Manage devices
            </a>
          </div>
        </div>
      </div>
    </Shell>
  );
}
