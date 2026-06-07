// Devices — what's signed into this account right now.
//
// Cleanup pass:
//   * Header used to say "Your Single plan allows 1 device" with the
//     plan name hardcoded. Replaced with the real access state from
//     /api/auth/me — trial / subscribed / expired — and the device
//     limit is described in terms of the current subscription instead
//     of asserting "Single".
//   * "Email me on every new sign-in" + "Auto-revoke devices unused
//     for 60 days" toggles had no backend wiring; flipping them
//     persisted nowhere. Removed entirely. They'll come back as a
//     single working card when the session indexing + email service
//     are deployed.
//   * "Sign out from all devices" button only filtered local React
//     state — other devices kept their cookies. Replaced with an
//     honest "Sign out THIS device" action that calls /api/auth/logout.
//
// What we can show truthfully today: the device you're using right
// now. Once sessions are indexed per user (KV write at session create,
// list under user_sessions:<userId>) this page lights up.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '../Shell';
import { signOut } from '@/lib/session';
import { useAccess } from '@/lib/useAccess';
import { getCurrentDevice, type BrowserDevice } from '@/lib/deviceFingerprint';

export default function Devices() {
  const access = useAccess();
  const [devices, setDevices] = useState<BrowserDevice[]>([]);

  useEffect(() => { setDevices([getCurrentDevice()]); }, []);

  const planLabel =
    access.status === 'subscribed' ? 'your subscription' :
    access.status === 'trial'      ? 'your free trial' :
    access.status === 'expired'    ? 'your expired trial' :
                                     'your account';

  return (
    <Shell active="devices">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Devices</div>
        <h1 className="ac-panel-title">Signed-in devices</h1>
        <p className="ac-panel-sub">
          Devices that are currently signed into {planLabel}. Sign in on a new
          device from <Link href="/tv/login" className="ac-auth-link">/tv/login</Link>{' '}
          and it shows up here.
        </p>
      </header>

      <div className="ac-card">
        <div className="ac-card-title">This device · {devices.length}</div>
        {devices.map((d) => (
          <div key={d.id} className={`ac-device ${d.active ? 'ac-device-active' : ''}`}>
            <div className="ac-device-icon">{d.icon}</div>
            <div className="ac-device-meta">
              <div className="ac-device-name">
                {d.name}
                {d.active && <span className="ac-device-tag">THIS DEVICE</span>}
              </div>
              <div className="ac-device-sub">{d.loc} · {d.last}</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="ac-btn ac-btn-sm" disabled style={{ opacity: 0.5 }}>Current</button>
            </div>
          </div>
        ))}
        <p style={{ fontSize: 13, color: 'var(--ns-text-faint)', marginTop: 14, lineHeight: 1.55 }}>
          We currently only list the device you&apos;re using right now. Other
          signed-in devices will appear here once per-user session indexing
          ships — until then, signing out from one device only affects that
          device&apos;s cookie.
        </p>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Sign out</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, margin: '0 0 14px' }}>
          Sign out from this device. Your settings stay synced to your account
          and reappear the next time you sign in here.
        </p>
        <button className="ac-btn ac-btn-danger" onClick={signOut}>
          Sign out from this device
        </button>
      </div>
    </Shell>
  );
}
