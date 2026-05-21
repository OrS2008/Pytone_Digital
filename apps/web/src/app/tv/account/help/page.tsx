import Shell from '../Shell';
export default function Help() {
  return (
    <Shell active="help">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Help &amp; legal</div>
        <h1 className="ac-panel-title">We're here when you need us</h1>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div className="ac-card">
          <div className="ac-card-title">Get support</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <a className="ac-btn" href="#">📚  Help centre &amp; FAQs</a>
            <a className="ac-btn" href="#">💬  Live chat (24/7)</a>
            <a className="ac-btn" href="mailto:support@novastream.tv">✉️  support@novastream.tv</a>
            <a className="ac-btn" href="#">🐦  @NovaStreamHelp on X</a>
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
          <button className="ac-btn ac-btn-sm" style={{ marginTop: 14 }}>Copy diagnostics</button>
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Legal</div>
        {[
          'Terms of service',
          'Privacy policy',
          'Cookies & tracking',
          'Acceptable use',
          'Open-source licences',
          'Refund policy',
        ].map((t) => (
          <a key={t} href="#" style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 0', borderTop: '1px solid var(--ns-hairline)',
            color: 'var(--ns-text)', textDecoration: 'none',
          }}>
            <span>{t}</span>
            <span style={{ color: 'var(--ns-text-faint)' }}>›</span>
          </a>
        ))}
      </div>

      <div className="ac-card ac-btn-danger" style={{ borderRadius: 14 }}>
        <div className="ac-card-title" style={{ color: 'inherit' }}>Danger zone</div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Export my data</div>
            <div className="ac-toggle-desc">Watch history, favourites, recordings index, profile — GDPR Article 20.</div>
          </div>
          <button className="ac-btn ac-btn-sm">Request export</button>
        </div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Delete my account</div>
            <div className="ac-toggle-desc">Permanently removes the account + recordings + history within 30 days.</div>
          </div>
          <button className="ac-btn ac-btn-sm ac-btn-danger">Start deletion</button>
        </div>
      </div>
    </Shell>
  );
}
