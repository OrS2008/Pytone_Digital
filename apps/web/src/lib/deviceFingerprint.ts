// Reads the current browser's properties for the "this device" row on
// the Devices and Security pages. Returns user-facing labels — not a
// tracking fingerprint. All values come from navigator/window APIs the
// user already exposes when they load the page.
//
// IP and geo are intentionally NOT inferred here. The real auth backend
// records them server-side (X-Forwarded-For + a privacy-preserving geo
// lookup) and pushes them down through the sessions list. Until that's
// wired up we show "—" rather than invented values.

'use client';

import { userKey } from './session';

export interface BrowserDevice {
  id:        string;
  icon:      string;
  name:      string;
  ip:        string;
  loc:       string;
  last:      string;
  active:    boolean;
}

// Inferred from the User-Agent string. Keeps the device labels short
// and recognisable: "Chrome on macOS", "Safari on iPhone", etc.
function describeUA(): { icon: string; name: string } {
  if (typeof navigator === 'undefined') {
    return { icon: '💻', name: 'This browser' };
  }
  const ua = navigator.userAgent;

  let os = 'this device';
  if (/iPhone|iPad|iPod/i.test(ua)) os = /iPad/i.test(ua) ? 'iPad' : 'iPhone';
  else if (/Android/i.test(ua))     os = 'Android';
  else if (/Windows/i.test(ua))     os = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua))       os = 'Linux';
  else if (/CrOS/i.test(ua))        os = 'ChromeOS';

  let browser = 'browser';
  if      (/Edg\//i.test(ua))      browser = 'Edge';
  else if (/OPR\//i.test(ua))      browser = 'Opera';
  else if (/Firefox\//i.test(ua))  browser = 'Firefox';
  else if (/Chrome\//i.test(ua))   browser = 'Chrome';
  else if (/Safari\//i.test(ua))   browser = 'Safari';

  let icon = '💻';
  if (/iPhone|Android.*Mobile/i.test(ua)) icon = '📱';
  else if (/iPad|Tablet/i.test(ua))       icon = '📋';
  else if (/SmartTV|AppleTV|GoogleTV|WebOS/i.test(ua)) icon = '📺';

  return { icon, name: `${browser} on ${os}` };
}

// Stable opaque id for "this browser" so the user can sign it out
// individually rather than only from the global "sign out everywhere"
// button. We store it once per device + tenant.
function deviceId(): string {
  if (typeof window === 'undefined') return 'this-device';
  try {
    const key = userKey('device.id');
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const next = 'd-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(key, next);
    return next;
  } catch {
    return 'this-device';
  }
}

export function getCurrentDevice(): BrowserDevice {
  const { icon, name } = describeUA();
  return {
    id:     deviceId(),
    icon,
    name,
    ip:     '—',
    loc:    '—',
    last:   'Active now',
    active: true,
  };
}
