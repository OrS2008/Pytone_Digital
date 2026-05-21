// Plans page — shows Single (1 device) and Multi (up to 4 devices) side by
// side. This is reached both from the upgrade flow and from "manage
// subscription". The "Single" card is marked as Recommended for the most
// common buyer.
import Shell from '../Shell';

const FEATURES_SINGLE = [
  { ok: true,  label: '1 device at a time' },
  { ok: true,  label: 'Live TV + your M3U / Xtream / Stalker' },
  { ok: true,  label: 'Personal EPG + posters' },
  { ok: true,  label: '14-day cloud DVR + catch-up' },
  { ok: true,  label: 'Restart programme from beginning' },
  { ok: true,  label: 'AI playback failover' },
  { ok: true,  label: 'Watch on TV, phone, tablet, web' },
  { ok: false, label: 'Watch on more than 1 device at the same time' },
];
const FEATURES_MULTI = [
  { ok: true, label: 'Up to 4 devices at the same time' },
  { ok: true, label: 'Everything in Single' },
  { ok: true, label: 'Family profiles + per-profile parental controls' },
  { ok: true, label: 'Per-profile favourites & watch history' },
  { ok: true, label: 'Shared DVR library' },
  { ok: true, label: 'Spoiler protection for sports' },
  { ok: true, label: 'Priority customer support' },
];

export default function Plans() {
  return (
    <Shell active="plans">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Choose a plan</div>
        <h1 className="ac-panel-title">Pick what fits your home</h1>
        <p className="ac-panel-sub">
          Both plans include every feature in the app. The only difference is how many
          devices can stream at the same time. You can change or cancel any time.
        </p>
      </header>

      <div className="ac-plans">
        <div className="ac-plan ac-plan-recommended">
          <span className="ac-plan-badge">RECOMMENDED</span>
          <div className="ac-plan-name">Single</div>
          <h2 className="ac-plan-headline">For one screen</h2>
          <p className="ac-plan-tagline">Perfect if you watch alone or always in the same room.</p>

          <div className="ac-plan-price">
            <span className="ac-plan-currency">₪</span>
            <span className="ac-plan-amount">39</span>
            <span className="ac-plan-cycle">/ month</span>
          </div>

          <ul className="ac-plan-features">
            {FEATURES_SINGLE.map((f, i) => (
              <li key={i} className={f.ok ? '' : 'mute'}>
                <span className="check">{f.ok ? '✓' : '✕'}</span> {f.label}
              </li>
            ))}
          </ul>
          <button className="ac-btn ac-btn-primary" style={{ justifyContent: 'center', padding: '16px 24px' }}>
            Start Single — ₪39/mo
          </button>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ns-text-faint)', textAlign: 'center' }}>
            Free for 5 more days. Cancel any time.
          </div>
        </div>

        <div className="ac-plan">
          <div className="ac-plan-name">Multi</div>
          <h2 className="ac-plan-headline">For the whole home</h2>
          <p className="ac-plan-tagline">Up to four devices streaming at once. Family profiles included.</p>

          <div className="ac-plan-price">
            <span className="ac-plan-currency">₪</span>
            <span className="ac-plan-amount">69</span>
            <span className="ac-plan-cycle">/ month</span>
          </div>

          <ul className="ac-plan-features">
            {FEATURES_MULTI.map((f, i) => (
              <li key={i}>
                <span className="check">✓</span> {f.label}
              </li>
            ))}
          </ul>
          <button className="ac-btn" style={{ justifyContent: 'center', padding: '16px 24px' }}>
            Start Multi — ₪69/mo
          </button>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ns-text-faint)', textAlign: 'center' }}>
            Save ₪87/year with annual billing.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 28, fontSize: 13, color: 'var(--ns-text-faint)', textAlign: 'center' }}>
        Payments are processed securely by Stripe. Your card is never stored on our servers.
        VAT included where applicable.
      </div>
    </Shell>
  );
}
