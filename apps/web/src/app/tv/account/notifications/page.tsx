// Notifications.
//
// This page used to render 8 toggles spread across "Content alerts",
// "Account & security" and "Product updates". Not a single one had
// `persistKey`, so flipping any toggle wrote nothing to storage and
// triggered nothing in the rest of the app. The categories also
// referenced features that don't exist (series episode tracking,
// recording success notifications, card-expiry emails).
//
// Honest rewrite: explain what notifications the app DOES send today
// (almost none) and what will arrive once the notification service
// is deployed. No fake controls — flipping a switch should change
// behaviour, full stop.

import Link from 'next/link';
import Shell from '../Shell';

const TODAY = [
  {
    title:  'In-app activation banner',
    detail: 'Shown once on first sign-up to confirm the trial has started.',
  },
  {
    title:  'In-app trial-ended overlay',
    detail: 'Shown when your 7-day trial is over, blocking the player until you subscribe.',
  },
];

const PLANNED = [
  {
    title:  'Email · new sign-in',
    detail: 'When a new device signs into your account from an unfamiliar IP.',
  },
  {
    title:  'Email · trial ending in 24h',
    detail: 'A heads-up so you can subscribe before access cuts off.',
  },
  {
    title:  'In-app · favourite team match starting',
    detail: 'Live-event reminders for channels you have starred.',
  },
];

export default function Notifications() {
  return (
    <Shell active="notifications">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Notifications</div>
        <h1 className="ac-panel-title">What we send you</h1>
        <p className="ac-panel-sub">
          We don&apos;t ship a notification preferences panel that pretends to
          control settings that aren&apos;t wired up. Here&apos;s what Nova Stream
          actually sends today, and what will be configurable once the
          notification service is deployed.
        </p>
      </header>

      <div className="ac-card">
        <div className="ac-card-title">Active today</div>
        {TODAY.map((t) => (
          <div key={t.title} style={{
            padding: '12px 0',
            borderTop: '1px solid var(--ns-hairline)',
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ns-text)' }}>
              <span className="ac-status-pill ac-status-ok" style={{ fontSize: 10, marginRight: 10 }}>ACTIVE</span>
              {t.title}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ns-text-muted)', marginTop: 4 }}>
              {t.detail}
            </div>
          </div>
        ))}
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Planned</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 13.5, margin: '0 0 12px' }}>
          On the roadmap. Will appear here with real on/off controls once each one ships.
        </p>
        {PLANNED.map((p) => (
          <div key={p.title} style={{
            padding: '12px 0',
            borderTop: '1px solid var(--ns-hairline)',
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ns-text)' }}>
              <span className="ac-status-pill ac-status-mut" style={{ fontSize: 10, marginRight: 10 }}>PLANNED</span>
              {p.title}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ns-text-muted)', marginTop: 4 }}>
              {p.detail}
            </div>
          </div>
        ))}
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Sound &amp; vibration</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, margin: 0 }}>
          The app does not produce notification sounds or vibrate. If your
          device makes a sound when an in-app event fires, that&apos;s your
          browser&apos;s standard alert tone, not us.
        </p>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Marketing email</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, margin: '0 0 14px' }}>
          We don&apos;t send marketing emails. The only email you may receive
          is the activation message at sign-up (one-shot, transactional).
          See <Link href="/legal/privacy" className="ac-auth-link">Privacy</Link>{' '}
          for what we hold.
        </p>
      </div>
    </Shell>
  );
}
