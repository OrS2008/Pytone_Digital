import Shell from '../Shell';
import Toggle from '@/components/ui/Toggle';

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
          { t: 'Favourite team match starting',                     d: '10-min countdown before kickoff of marked teams.',         on: true  },
          { t: 'New episode of a watched series',                   d: 'When the next episode lands on any source you have.',      on: true  },
          { t: 'Live programme starts on a favourite channel',      d: 'Premium events on starred channels.',                       on: true  },
          { t: 'Recording started / failed',                        d: 'Heads-up if anything went wrong with a planned recording.', on: false },
        ].map((r, i) => (
          <div key={i} className="ac-toggle-row">
            <div><div className="ac-toggle-title">{r.t}</div><div className="ac-toggle-desc">{r.d}</div></div>
            <Toggle initialOn={r.on} />
          </div>
        ))}
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Account & security</div>
        {[
          { t: 'New device sign-in',           d: 'Email + push for every new device. Recommended on.' },
          { t: 'Failed sign-in attempts',      d: 'Multiple failures from an unknown IP.' },
          { t: 'Payment receipts',             d: 'After each successful charge.' },
          { t: 'Card expiring soon',           d: '14 days before your card expires.' },
        ].map((r, i) => (
          <div key={i} className="ac-toggle-row">
            <div><div className="ac-toggle-title">{r.t}</div><div className="ac-toggle-desc">{r.d}</div></div>
            <Toggle initialOn />
          </div>
        ))}
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Product updates</div>
        <div className="ac-toggle-row">
          <div><div className="ac-toggle-title">New features &amp; tips</div><div className="ac-toggle-desc">Monthly, never spammy. Unsub anytime.</div></div>
          <Toggle />
        </div>
      </div>
    </Shell>
  );
}
