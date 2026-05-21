// Variant 3 — EDITORIAL MONO.
//
// Pure monochrome (#000 / #fff) with a single acid-lime accent (#C7F538).
// Razor-sharp grid, magazine-cover hierarchy, hairline rules. Heavy
// negative space. The most opinionated of the five — looks unmistakably
// premium-editorial (Vogue / NYT / Apple Music Pro).
//
// Type pairing: huge sans-serif headlines + small uppercase mono labels.
import { MOCK_CHANNELS } from '@/components/tv/live/mockChannels';
import './mono.css';

export default function MonoVariant() {
  const channels = MOCK_CHANNELS;
  const active = channels[3];

  return (
    <main className="mono">
      <header className="mono-nav">
        <div className="mono-wm">
          NOVA<span className="mono-wm-bar" />STREAM
        </div>
        <nav className="mono-links">
          <a className="mono-link mono-link-active">Live</a>
          <a className="mono-link">Movies</a>
          <a className="mono-link">Sports</a>
          <a className="mono-link">DVR</a>
          <a className="mono-link">Search</a>
        </nav>
        <div className="mono-trial">TRIAL · 5D</div>
      </header>

      <div className="mono-body">
        <aside className="mono-rail">
          <div className="mono-rail-head">
            <span className="mono-rail-count">237</span>
            <span className="mono-rail-label">channels</span>
          </div>

          {channels.slice(0, 8).map((c) => (
            <div key={c.id} className={`mono-row ${c.id === active.id ? 'mono-row-active' : ''}`}>
              <span className="mono-num">{String(c.number).padStart(3, '0')}</span>
              <div className="mono-meta">
                <div className="mono-name">{c.name}</div>
                <div className="mono-now">{c.now?.title}</div>
              </div>
              {c.id === active.id && <span className="mono-marker" />}
            </div>
          ))}
        </aside>

        <section className="mono-stage">
          <div className="mono-art" />
          <div className="mono-art-fade" />

          <div className="mono-stage-inner">
            <div className="mono-eyebrow">
              <span className="mono-now-tag">NOW</span>
              <span>·</span>
              <span>SPORT 1 · CH 021</span>
              <span>·</span>
              <span>20:00 — 22:30</span>
            </div>

            <h1 className="mono-title">
              Premier League<br />
              <em>Sunday<br/>Big Match</em>
            </h1>

            <div className="mono-divider" />

            <div className="mono-detail-grid">
              <div>
                <div className="mono-label">Fixture</div>
                <div className="mono-value">Arsenal <span className="mono-vs">vs</span> Manchester City</div>
              </div>
              <div>
                <div className="mono-label">Stadium</div>
                <div className="mono-value">Emirates, London</div>
              </div>
              <div>
                <div className="mono-label">Status</div>
                <div className="mono-value">
                  <span className="mono-live-dot" />
                  Kick-off · 35′
                </div>
              </div>
            </div>

            <div className="mono-progress">
              <div className="mono-progress-fill" style={{ width: '32%' }} />
            </div>

            <div className="mono-actions">
              <button className="mono-btn mono-btn-primary">Restart programme  ↺</button>
              <button className="mono-btn">Record  ●</button>
              <button className="mono-btn">More info  →</button>
            </div>
          </div>

          <aside className="mono-upnext">
            <div className="mono-upnext-label">UP NEXT</div>
            <div className="mono-upnext-item">
              <div className="mono-upnext-time">22:30</div>
              <div className="mono-upnext-title">Hour of Sport</div>
            </div>
            <div className="mono-upnext-item">
              <div className="mono-upnext-time">23:00</div>
              <div className="mono-upnext-title">NBA · Lakers vs Celtics</div>
            </div>
            <div className="mono-upnext-item">
              <div className="mono-upnext-time">01:30</div>
              <div className="mono-upnext-title">Champions League Wrap</div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
