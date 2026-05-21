// Variant 5 — PREMIUM CHARCOAL.
//
// Quiet luxury. Warm charcoal (#14110D) base with brushed gold (#C8A35C)
// accents and cream text. Plex Pro / boutique-hi-fi feel. Type pairs an
// elegant serif (Crimson) with humanist sans (Inter). Soft rounded
// surfaces, never sharp.
//
// Why this could win: it doesn't look like an IPTV app at all — it looks
// like a streaming service a connoisseur would pay double for. People
// trust gold and warm tones with their money.
import { MOCK_CHANNELS } from '@/components/tv/live/mockChannels';
import './premium.css';

export default function PremiumVariant() {
  const channels = MOCK_CHANNELS;
  const active = channels[3];

  return (
    <main className="pr">
      <div className="pr-vignette" />

      <header className="pr-nav">
        <div className="pr-wm">
          <span className="pr-wm-icon">✦</span>
          <span className="pr-wm-text">Nova Stream</span>
        </div>
        <nav className="pr-links">
          <a className="pr-link pr-link-active">Live</a>
          <a className="pr-link">Cinema</a>
          <a className="pr-link">Sports</a>
          <a className="pr-link">DVR</a>
          <a className="pr-link">Library</a>
        </nav>
        <div className="pr-account">
          <div className="pr-avatar">
            <span>OS</span>
          </div>
          <div className="pr-trial">
            <div className="pr-trial-label">Trial</div>
            <div className="pr-trial-value">5 days remaining</div>
          </div>
        </div>
      </header>

      <div className="pr-body">
        <aside className="pr-rail">
          <div className="pr-rail-section">
            <div className="pr-rail-heading">All channels</div>
            <div className="pr-rail-sub">237 available</div>
          </div>

          {channels.slice(0, 8).map((c) => (
            <div key={c.id} className={`pr-row ${c.id === active.id ? 'pr-row-active' : ''}`}>
              <span className="pr-num">{c.number}</span>
              <span className="pr-logo">
                {c.logoUrl ? <img src={c.logoUrl} alt="" /> : <em>{c.name.slice(0, 2)}</em>}
              </span>
              <div className="pr-meta">
                <div className="pr-name">{c.name}</div>
                <div className="pr-now">{c.now?.title}</div>
              </div>
              {c.id === active.id && <span className="pr-active-pip" />}
            </div>
          ))}
        </aside>

        <section className="pr-stage">
          <div className="pr-art" />
          <div className="pr-art-fade" />

          <div className="pr-card">
            <div className="pr-card-channel">
              <span className="pr-card-num">21</span>
              <span className="pr-card-dot" />
              <span className="pr-card-chname">Sport 1</span>
              <span className="pr-card-dot" />
              <span className="pr-card-now">Now playing</span>
            </div>

            <h1 className="pr-title">Premier League<br/><span className="pr-title-em">Sunday Big Match</span></h1>
            <div className="pr-sub">Arsenal vs. Manchester City · Emirates Stadium · 20:00 – 22:30</div>

            <div className="pr-progress">
              <div className="pr-progress-fill" style={{ width: '32%' }} />
            </div>
            <div className="pr-progress-meta">
              <span>Kick-off · 35 min in</span>
              <span>1 hour 55 minutes remaining</span>
            </div>

            <div className="pr-actions">
              <button className="pr-btn pr-btn-primary">
                <span className="pr-btn-icon">↺</span>
                Restart programme
              </button>
              <button className="pr-btn">Record</button>
              <button className="pr-btn">Programme info</button>
            </div>
          </div>

          <aside className="pr-upnext">
            <div className="pr-upnext-label">Up next on Sport 1</div>
            <UpRow time="22:30" title="Hour of Sport" sub="Sports magazine · 30 min" />
            <UpRow time="23:00" title="NBA · Lakers vs. Celtics" sub="Live · 2h 30" />
            <UpRow time="01:30" title="Champions League Wrap" sub="Highlights · 60 min" />
          </aside>
        </section>
      </div>
    </main>
  );
}

function UpRow({ time, title, sub }: { time: string; title: string; sub: string }) {
  return (
    <div className="pr-up">
      <div className="pr-up-time">{time}</div>
      <div className="pr-up-meta">
        <div className="pr-up-title">{title}</div>
        <div className="pr-up-sub">{sub}</div>
      </div>
    </div>
  );
}
