// Variant 4 — CYBER HUD.
//
// Sci-fi command-centre vibe. Cyan neon (#00F0FF) + amber warning
// (#FFB020) on a jet-black canvas overlaid with a subtle grid. Numbers
// are mono. Corners are clipped (clip-path) rather than rounded.
//
// The "futuristic" choice — most polarising of the five. People either
// love it or feel it's too on-the-nose for an IPTV app.
import { MOCK_CHANNELS } from '@/components/tv/live/mockChannels';
import './cyber.css';

export default function CyberVariant() {
  const channels = MOCK_CHANNELS;
  const active = channels[3];

  return (
    <main className="cy">
      <div className="cy-grid-overlay" />
      <div className="cy-scanline" />

      <header className="cy-nav">
        <div className="cy-wm">
          <span className="cy-wm-bracket">[</span>
          NOVA<span className="cy-wm-sep">/</span>STREAM
          <span className="cy-wm-bracket">]</span>
        </div>
        <nav className="cy-links">
          <a className="cy-link cy-link-active">LIVE</a>
          <a className="cy-link">MOVIES</a>
          <a className="cy-link">SPORTS</a>
          <a className="cy-link">DVR</a>
          <a className="cy-link">SRCH</a>
        </nav>
        <div className="cy-stats">
          <span className="cy-stat">T-05D</span>
          <span className="cy-stat cy-stat-ok">●  237 CH</span>
          <span className="cy-stat">21:35 UTC</span>
        </div>
      </header>

      <div className="cy-body">
        <aside className="cy-rail">
          <div className="cy-rail-head">
            <span className="cy-rail-id">CH.LIST</span>
            <span className="cy-rail-count">237 / 237</span>
          </div>
          {channels.slice(0, 8).map((c, i) => (
            <div key={c.id} className={`cy-row ${c.id === active.id ? 'cy-row-active' : ''}`}>
              <span className="cy-row-idx">{String(i + 1).padStart(2, '0')}</span>
              <span className="cy-num">{String(c.number).padStart(3, '0')}</span>
              <div className="cy-meta">
                <div className="cy-name">{c.name}</div>
                <div className="cy-now">› {c.now?.title}</div>
              </div>
              {c.id === active.id && <span className="cy-live">▶ LIVE</span>}
            </div>
          ))}
        </aside>

        <section className="cy-stage">
          <div className="cy-art" />
          <div className="cy-art-fade" />

          <div className="cy-tag-row">
            <span className="cy-tag cy-tag-live">▶ LIVE</span>
            <span className="cy-tag">CH.021</span>
            <span className="cy-tag">SPORT 1</span>
            <span className="cy-tag">SRC.PRIMARY</span>
            <span className="cy-tag cy-tag-q">4K · HDR10 · 8000 kbps</span>
          </div>

          <h1 className="cy-title">PREMIER LEAGUE</h1>
          <h2 className="cy-subtitle">Sunday Big Match :: Arsenal × Manchester City</h2>

          <div className="cy-readout">
            <div className="cy-readout-cell">
              <div className="cy-readout-label">RUNTIME</div>
              <div className="cy-readout-value">00:35:14</div>
            </div>
            <div className="cy-readout-cell">
              <div className="cy-readout-label">REMAINING</div>
              <div className="cy-readout-value">01:54:46</div>
            </div>
            <div className="cy-readout-cell">
              <div className="cy-readout-label">PROGRESS</div>
              <div className="cy-readout-value">32%</div>
            </div>
            <div className="cy-readout-cell">
              <div className="cy-readout-label">BITRATE</div>
              <div className="cy-readout-value">7,940 K</div>
            </div>
          </div>

          <div className="cy-progress">
            <div className="cy-progress-track">
              <div className="cy-progress-fill" style={{ width: '32%' }} />
            </div>
            <div className="cy-progress-marks">
              <span>20:00</span><span>20:30</span><span>21:00</span><span>21:30</span><span>22:00</span><span>22:30</span>
            </div>
          </div>

          <div className="cy-actions">
            <button className="cy-btn cy-btn-primary">
              <span className="cy-btn-icon">↺</span> RESTART_PROGRAMME
            </button>
            <button className="cy-btn">● REC</button>
            <button className="cy-btn">ⓘ INFO</button>
            <button className="cy-btn">⤬ EXIT</button>
          </div>

          <aside className="cy-queue">
            <div className="cy-queue-label">NEXT // SPORT 1</div>
            <div className="cy-queue-line">22:30 ::: HOUR OF SPORT</div>
            <div className="cy-queue-line">23:00 ::: NBA · LAKERS × CELTICS</div>
            <div className="cy-queue-line">01:30 ::: UCL WRAP</div>
          </aside>
        </section>
      </div>
    </main>
  );
}
