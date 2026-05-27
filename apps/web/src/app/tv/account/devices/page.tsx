// Devices — currently-signed-in devices. The auth backend will own this
// list eventually (every refresh-token session is a device); until it's
// deployed we render the current browser only — never invented entries.
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '../Shell';
import Toggle from '@/components/ui/Toggle';
import { getCurrentDevice, type BrowserDevice } from '@/lib/deviceFingerprint';

export default function Devices() {
  // Empty SSR placeholder; populated on mount once navigator is available.
  const [devices, setDevices] = useState<BrowserDevice[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [signedOutAll, setSignedOutAll] = useState(false);

  useEffect(() => {
    setDevices([getCurrentDevice()]);
  }, []);

  function signOutAll() {
    setDevices(devices.filter((d) => d.active));
    setConfirm(false);
    setSignedOutAll(true);
    setTimeout(() => setSignedOutAll(false), 1800);
  }

  return (
    <Shell active="devices">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Devices</div>
        <h1 className="ac-panel-title">Manage signed-in devices</h1>
        <p className="ac-panel-sub">
          Your <strong style={{ color: 'var(--ns-text)' }}>Single</strong> plan allows
          1 device streaming at the same time. To stream from a second device,
          either sign out from an existing one or upgrade to{' '}
          <Link href="/tv/account/plans" className="ac-auth-link">Multi (4 devices)</Link>.
        </p>
      </header>

      <div className="ac-card">
        <div className="ac-card-title">Signed-in devices · {devices.length}</div>
        {devices.map((d) => (
          <div key={d.id} className={`ac-device ${d.active ? 'ac-device-active' : ''}`}>
            <div className="ac-device-icon">{d.icon}</div>
            <div className="ac-device-meta">
              <div className="ac-device-name">
                {d.name}
                {d.active && <span className="ac-device-tag">THIS DEVICE</span>}
              </div>
              <div className="ac-device-sub">
                {d.loc} · {d.ip} · {d.last}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {d.active && (
                <button className="ac-btn ac-btn-sm" disabled style={{ opacity: 0.5 }}>Current</button>
              )}
            </div>
          </div>
        ))}
        {devices.length === 1 && (
          <p style={{ fontSize: 13, color: 'var(--ns-text-faint)', marginTop: 12 }}>
            This is the only device signed in. Other devices appear here automatically
            when they sign into your account.
          </p>
        )}
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Security alerts</div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Email me on every new sign-in</div>
            <div className="ac-toggle-desc">We&apos;ll send a notice when an unfamiliar device signs in. You can revoke from the email.</div>
          </div>
          <Toggle initialOn />
        </div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Auto-revoke devices unused for 60 days</div>
            <div className="ac-toggle-desc">Devices that haven&apos;t streamed in 60 days are signed out automatically.</div>
          </div>
          <Toggle initialOn />
        </div>
        <div style={{ marginTop: 16 }}>
          {signedOutAll ? (
            <span style={{
              padding: '10px 16px', display: 'inline-block',
              background: 'var(--ns-accent-soft)', color: 'var(--ns-accent)',
              borderRadius: 10, fontSize: 13, fontWeight: 700,
            }}>Done ✓ All other devices signed out.</span>
          ) : confirm ? (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ alignSelf: 'center', color: 'var(--ns-text-muted)', fontSize: 13 }}>
                This signs you out from every device except this one. Confirm?
              </span>
              <button className="ac-btn ac-btn-sm" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="ac-btn ac-btn-sm ac-btn-danger" onClick={signOutAll}>Yes, sign out</button>
            </div>
          ) : (
            <button className="ac-btn ac-btn-danger" onClick={() => setConfirm(true)}>
              ⨂  Sign out from all devices
            </button>
          )}
        </div>
      </div>
    </Shell>
  );
}
