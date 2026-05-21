// Variant 1 — APEX DARK.
//
// Polished version of the production look. Deep black + signature magenta,
// generous spacing, large refined typography. Apple TV / Disney+ inspired.
//
// What makes it feel premium:
//   - Real type contrast (huge 48px hero title vs 13px metadata).
//   - Pink limited to focus + the channel-number badge.
//   - Hairline (1px) separators, never thick borders.
//   - Subtle 0.5s easeOut on focus transforms — perceptible but not bouncy.
import { MOCK_CHANNELS } from '@/components/tv/live/mockChannels';
import './apex.css';

export default function ApexVariant() {
  const channels = MOCK_CHANNELS;
  const active = channels[3]; // Sport 1 — has the most interesting demo data

  return (
    <main className="apex">
      <header className="apex-nav">
        <div className="apex-wordmark">NOVA STREAM</div>
        <nav className="apex-nav-links">
          <a className="apex-link apex-link-active">Live</a>
          <a className="apex-link">Movies</a>
          <a className="apex-link">Sports</a>
          <a className="apex-link">DVR</a>
          <a className="apex-link">Search</a>
        </nav>
        <div className="apex-account">
          <span className="apex-trial">Trial · 5 days left</span>
          <div className="apex-avatar">OS</div>
        </div>
      </header>

      <div className="apex-body">
        <aside className="apex-rail">
          <div className="apex-rail-category">General</div>
          {channels.slice(0, 3).map((c, i) => (
            <Row key={c.id} ch={c} active={i === -1} />
          ))}
          <div className="apex-rail-category">Sports</div>
          {channels.slice(3, 5).map((c) => (
            <Row key={c.id} ch={c} active={c.id === active.id} />
          ))}
          <div className="apex-rail-category">Movies</div>
          {channels.slice(5, 6).map((c) => <Row key={c.id} ch={c} active={false} />)}
          <div className="apex-rail-category">Documentary</div>
          {channels.slice(7, 8).map((c) => <Row key={c.id} ch={c} active={false} />)}
        </aside>

        <section className="apex-stage">
          <div className="apex-stage-art" />
          <div className="apex-stage-fade" />
          <div className="apex-stage-meta">
            <div className="apex-eyebrow">LIVE  ·  SPORT 1  ·  21</div>
            <h1 className="apex-title">Premier League · Sunday Big Match</h1>
            <div className="apex-sub">Arsenal vs. Manchester City  ·  Emirates Stadium  ·  20:00 – 22:30</div>

            <div className="apex-progress">
              <div className="apex-progress-fill" style={{ width: '32%' }} />
            </div>
            <div className="apex-progress-meta">
              <span>20:35</span>
              <span>1:55 remaining</span>
              <span>22:30</span>
            </div>

            <div className="apex-actions">
              <button className="apex-btn apex-btn-primary">↺  Restart programme</button>
              <button className="apex-btn">●  Record</button>
              <button className="apex-btn">ⓘ  More info</button>
            </div>
          </div>

          <aside className="apex-upnext">
            <div className="apex-upnext-title">COMING UP ON SPORT 1</div>
            <Up time="22:30" title="Hour of Sport" len="30 min" />
            <Up time="23:00" title="NBA: Lakers vs. Celtics" len="2h 30" />
            <Up time="01:30" title="Champions League Wrap" len="60 min" />
          </aside>
        </section>
      </div>
    </main>
  );
}

function Row({ ch, active }: { ch: typeof MOCK_CHANNELS[number]; active: boolean }) {
  return (
    <div className={`apex-row ${active ? 'apex-row-active' : ''}`}>
      <span className="apex-num">{ch.number}</span>
      <span className="apex-logo">{ch.logoUrl ? <img src={ch.logoUrl} alt="" /> : <em>{ch.name.slice(0, 3)}</em>}</span>
      <span className="apex-meta">
        <span className="apex-name">{ch.name}</span>
        <span className="apex-now">{ch.now?.title ?? '—'}</span>
      </span>
    </div>
  );
}

function Up({ time, title, len }: { time: string; title: string; len: string }) {
  return (
    <div className="apex-up">
      <span className="apex-up-time">{time}</span>
      <span className="apex-up-title">{title}</span>
      <span className="apex-up-len">{len}</span>
    </div>
  );
}
