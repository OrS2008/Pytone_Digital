// Variant 2 — AURORA GLASS.
//
// VisionOS-inspired: a soft aurora gradient backdrop with frosted-glass
// cards floating above it. Pastel mint + lavender accents on near-black.
// Generous 24px corner radii. Subtle, dreamy, modern.
//
// Why it works on TV:
//   - Backdrop-filter blur reads beautifully at 4K and is fully GPU-cheap
//     on modern WebKit (LG webOS 6.0+).
//   - Pastel hues are gentler than pure white in dim rooms.
//   - Keeps high contrast where it matters (titles, channel number).
import { MOCK_CHANNELS } from '@/components/tv/live/mockChannels';
import './aurora.css';

export default function AuroraVariant() {
  const channels = MOCK_CHANNELS;
  const active = channels[3];

  return (
    <main className="aur">
      <div className="aur-blob aur-blob-mint" />
      <div className="aur-blob aur-blob-violet" />
      <div className="aur-blob aur-blob-pink" />

      <header className="aur-nav">
        <div className="aur-wordmark">
          <span className="aur-dot" />
          Nova Stream
        </div>
        <nav className="aur-nav-links">
          <a className="aur-link aur-link-active">Live</a>
          <a className="aur-link">Movies</a>
          <a className="aur-link">Sports</a>
          <a className="aur-link">DVR</a>
        </nav>
        <div className="aur-trial">5 days of trial remaining</div>
      </header>

      <div className="aur-body">
        <aside className="aur-rail glass">
          <div className="aur-rail-head">
            <h2>Channels</h2>
            <span className="aur-rail-count">237</span>
          </div>
          {channels.slice(0, 8).map((c) => (
            <div key={c.id} className={`aur-row ${c.id === active.id ? 'aur-row-active' : ''}`}>
              <span className="aur-num">{c.number}</span>
              <span className="aur-logo">
                {c.logoUrl
                  ? <img src={c.logoUrl} alt="" />
                  : <em>{c.name.slice(0, 2)}</em>}
              </span>
              <div className="aur-meta">
                <div className="aur-name">{c.name}</div>
                <div className="aur-now">{c.now?.title}</div>
              </div>
              {c.id === active.id && <span className="aur-pulse" />}
            </div>
          ))}
        </aside>

        <section className="aur-stage">
          <div className="aur-art" />

          <div className="aur-infocard glass">
            <div className="aur-card-head">
              <div className="aur-card-channel">
                <span className="aur-card-num">21</span>
                <span className="aur-card-chname">Sport 1</span>
              </div>
              <span className="aur-live">● LIVE</span>
            </div>

            <h1 className="aur-title">Premier League · Sunday Big Match</h1>
            <div className="aur-sub">Arsenal vs. Manchester City  ·  Emirates Stadium</div>

            <div className="aur-progress">
              <div className="aur-progress-fill" style={{ width: '32%' }} />
            </div>
            <div className="aur-progress-meta">
              <span>20:00</span>
              <span className="aur-now-time">20:35</span>
              <span>22:30</span>
            </div>

            <div className="aur-actions">
              <button className="aur-btn aur-btn-primary">
                <span className="aur-btn-icon">↺</span>
                Restart programme
              </button>
              <button className="aur-btn">● Record</button>
              <button className="aur-btn">ⓘ Info</button>
            </div>
          </div>

          <aside className="aur-upnext glass">
            <h3>Up next</h3>
            <UpRow time="22:30" title="Hour of Sport" tag="Magazine" />
            <UpRow time="23:00" title="NBA: Lakers vs. Celtics" tag="Live" />
            <UpRow time="01:30" title="Champions League Wrap" tag="Highlights" />
          </aside>
        </section>
      </div>
    </main>
  );
}

function UpRow({ time, title, tag }: { time: string; title: string; tag: string }) {
  return (
    <div className="aur-up">
      <div className="aur-up-time">{time}</div>
      <div className="aur-up-title">{title}</div>
      <div className="aur-up-tag">{tag}</div>
    </div>
  );
}
