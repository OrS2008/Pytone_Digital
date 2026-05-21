import Shell from '../Shell';
export default function Notifications() {
  return (
    <Shell active="notifications">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Notifications</div>
        <h1 className="ac-panel-title">What we tell you about</h1>
        <p className="ac-panel-sub">Push notifications + email + in-app banners. You're in control of each.</p>
      </header>

      <div className="ac-card">
        <div className="ac-card-title">Content alerts</div>
        {[
          ['Favourite team match starting',     '10-min countdown before kickoff of marked teams.'],
          ['New episode of a watched series',   'When the next episode lands on any source you have.'],
          ['Live programme starts on a favourite channel', 'Premium / sports events on starred channels.'],
          ['DVR recording started / failed',    'Heads-up if anything went wrong with a planned recording.'],
        ].map(([t, d], i) => (
          <div key={i} className="ac-toggle-row">
            <div><div className="ac-toggle-title">{t}</div><div className="ac-toggle-desc">{d}</div></div>
            <div className={`ac-toggle ${i < 3 ? 'ac-toggle-on' : ''}`} />
          </div>
        ))}
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Account & security</div>
        {[
          ['New device sign-in',                'Email + push for every new device. Recommended on.'],
          ['Failed sign-in attempts',           'Multiple failures from an unknown IP.'],
          ['Payment receipts',                  'After each successful charge.'],
          ['Card expiring soon',                '14 days before your card expires.'],
        ].map(([t, d], i) => (
          <div key={i} className="ac-toggle-row">
            <div><div className="ac-toggle-title">{t}</div><div className="ac-toggle-desc">{d}</div></div>
            <div className="ac-toggle ac-toggle-on" />
          </div>
        ))}
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Product updates</div>
        <div className="ac-toggle-row">
          <div><div className="ac-toggle-title">New features &amp; tips</div><div className="ac-toggle-desc">Monthly, never spammy. Unsub anytime.</div></div>
          <div className="ac-toggle" />
        </div>
      </div>
    </Shell>
  );
}
