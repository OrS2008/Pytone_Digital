// Parental controls.
//
// Previous version listed PIN toggles ("Require PIN for adult content",
// "Require PIN to leave Kids profile", "Require PIN to change billing")
// and a "Change PIN" button. None of them were wired up: the toggles
// used <Toggle initialOn /> without a persistKey, the change-PIN
// button was an ActionButton that just flashed "PIN updated ✓". There
// is no PIN anywhere in the codebase that gates content on the
// player side — listing those controls implied a guarantee we
// couldn't keep.
//
// What actually persists today via this screen:
//   * The profile list and primary / kids flags  (parental.profiles)
//   * The channel block list                       (parental.blocked)
//   * The content rating cap select                (prefs.ratingCap)
//
// Profiles + the block list are stored in localStorage and ride the
// existing cross-device sync (lib/serverSync's SYNCED_KEYS allow-list
// will pick them up once added there). The player doesn't enforce
// any of it yet — we're honest about that in the page sub-copy
// rather than implying child-safety guarantees we can't deliver.

'use client';

import { useEffect, useState } from 'react';
import Shell from '../Shell';
import { userKey } from '@/lib/session';

interface Profile {
  id:       string;
  name:     string;
  icon:     string;
  cap:      string;
  primary?: boolean;
  kids?:    boolean;
}

const RATING_OPTIONS = [
  '18+ (TV-MA / R)',
  '16+ (TV-14 / PG-13)',
  '13+ (TV-PG)',
  'All ages',
];

function loadProfiles(): Profile[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(userKey('parental.profiles'));
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}
function saveProfiles(list: Profile[]) {
  try { localStorage.setItem(userKey('parental.profiles'), JSON.stringify(list)); } catch { /* ignore */ }
}
function loadBlocked(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(userKey('parental.blocked'));
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}
function saveBlocked(list: string[]) {
  try { localStorage.setItem(userKey('parental.blocked'), JSON.stringify(list)); } catch { /* ignore */ }
}
function loadRatingCap(): string {
  if (typeof window === 'undefined') return RATING_OPTIONS[0];
  try {
    const raw = localStorage.getItem(userKey('prefs.ratingCap'));
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return RATING_OPTIONS[0];
}
function saveRatingCap(value: string) {
  try { localStorage.setItem(userKey('prefs.ratingCap'), JSON.stringify(value)); } catch { /* ignore */ }
}

export default function Parental() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [blocked,  setBlocked]  = useState<string[]>([]);
  const [query,    setQuery]    = useState('');
  const [adding,   setAdding]   = useState<'profile' | 'kids' | null>(null);
  const [newName,  setNewName]  = useState('');
  const [ratingCap, setRatingCap] = useState<string>(RATING_OPTIONS[0]);

  useEffect(() => {
    setProfiles(loadProfiles());
    setBlocked(loadBlocked());
    setRatingCap(loadRatingCap());
  }, []);

  function addProfile(kind: 'profile' | 'kids') {
    const name = newName.trim();
    if (!name) return;
    const p: Profile = kind === 'kids'
      ? { id: 'p-' + Date.now(), name, icon: '🧒', cap: 'PG', kids: true }
      : { id: 'p-' + Date.now(), name, icon: '👤', cap: 'All ratings', primary: profiles.length === 0 };
    const next = [...profiles, p];
    setProfiles(next); saveProfiles(next);
    setAdding(null); setNewName('');
  }
  function removeProfile(id: string) {
    const next = profiles.filter((p) => p.id !== id);
    setProfiles(next); saveProfiles(next);
  }

  function addBlock() {
    const q = query.trim();
    if (!q) return;
    if (!blocked.includes(q)) {
      const next = [...blocked, q];
      setBlocked(next); saveBlocked(next);
    }
    setQuery('');
  }
  function removeBlock(n: string) {
    const next = blocked.filter((b) => b !== n);
    setBlocked(next); saveBlocked(next);
  }

  function updateRatingCap(v: string) {
    setRatingCap(v);
    saveRatingCap(v);
  }

  return (
    <Shell active="parental">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Parental controls</div>
        <h1 className="ac-panel-title">Family settings</h1>
        <p className="ac-panel-sub">
          Define a list of profiles for your household and a list of channels
          you want hidden. Today these settings live on your account and
          control which channels show up in the rail. They are{' '}
          <strong style={{ color: 'var(--ns-text)' }}>not</strong>{' '}
          a PIN-protected security boundary on the player itself — that
          enforcement is on the roadmap.
        </p>
      </header>

      <div className="ac-card">
        <div className="ac-card-title">Content rating cap</div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Maximum rating shown</div>
            <div className="ac-toggle-desc">
              Movies and shows beyond this rating are hidden from the rail
              and search results. Stored on your account.
            </div>
          </div>
          <select
            className="ac-input"
            style={{ width: 240 }}
            value={ratingCap}
            onChange={(e) => updateRatingCap(e.target.value)}
          >
            {RATING_OPTIONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Profiles · {profiles.length}</div>
        {profiles.length === 0 ? (
          <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, marginTop: 0 }}>
            No profiles yet. Add one for yourself and a separate Kids profile
            if you want a child-safe view of the catalogue.
          </p>
        ) : (
          profiles.map((p) => (
            <div key={p.id} className="ac-device">
              <div className="ac-device-icon" style={p.primary ? {
                background: 'var(--ns-accent-soft)', color: 'var(--ns-accent)',
              } : undefined}>{p.icon}</div>
              <div className="ac-device-meta">
                <div className="ac-device-name">
                  {p.name}
                  {p.primary && <span className="ac-device-tag">PRIMARY</span>}
                  {p.kids    && <span className="ac-device-tag">KIDS</span>}
                </div>
                <div className="ac-device-sub">
                  {p.kids ? 'Kids profile · capped at ' + p.cap : 'Adult · ' + p.cap}
                </div>
              </div>
              {!p.primary && (
                <button className="ac-btn ac-btn-sm ac-btn-danger" onClick={() => removeProfile(p.id)}>
                  Remove
                </button>
              )}
            </div>
          ))
        )}
        {adding ? (
          <form
            onSubmit={(e) => { e.preventDefault(); addProfile(adding); }}
            style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}
          >
            <input
              className="ac-input"
              autoFocus
              placeholder={adding === 'kids' ? 'Kids profile name' : 'Profile name'}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ flex: 1, minWidth: 200 }}
            />
            <button type="submit" className="ac-btn ac-btn-primary">Add</button>
            <button type="button" className="ac-btn" onClick={() => { setAdding(null); setNewName(''); }}>Cancel</button>
          </form>
        ) : (
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button className="ac-btn ac-btn-primary" onClick={() => setAdding('profile')}>+ Add profile</button>
            <button className="ac-btn" onClick={() => setAdding('kids')}>+ Add Kids profile</button>
          </div>
        )}
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Channel block list · {blocked.length}</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, marginTop: 0 }}>
          Channels listed here are hidden from the rail and from search
          results entirely.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); addBlock(); }}>
          <input
            className="ac-input"
            placeholder="Channel name to block, then Enter…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>
        {blocked.length === 0 ? (
          <p style={{ marginTop: 14, color: 'var(--ns-text-faint)', fontSize: 13 }}>
            No channels are currently blocked.
          </p>
        ) : (
          <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {blocked.map((n) => (
              <button
                key={n}
                onClick={() => removeBlock(n)}
                style={{
                  padding: '6px 12px',
                  background: 'var(--ns-bg-hover)',
                  border: '1px solid var(--ns-border)',
                  borderRadius: 999,
                  fontSize: 13,
                  display: 'flex', alignItems: 'center', gap: 6,
                  color: 'var(--ns-text)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
                title="Click to remove"
              >
                {n} <span style={{ color: 'var(--ns-text-faint)' }}>×</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ac-card">
        <div className="ac-card-title">PIN protection</div>
        <ParentalPin />
      </div>
    </Shell>
  );
}

// 4-digit PIN. Stored locally as a SHA-256 hash so a glance at devtools
// can't reveal the number. The PIN check is enforced by the
// useParentalPin hook (see lib/parental.ts) — any screen that wants to
// gate access wraps itself with it. Clearing the PIN reverts to the
// previous "filters only" behaviour.
const PIN_KEY = 'parental.pinHash';
const UNLOCK_KEY = 'parental.unlockedUntil';
const LEGACY_PIN_KEY = 'ns.parental.pinHash';

function ParentalPin() {
  const [hasPin,  setHasPin]  = useState(false);
  const [pin,     setPin]     = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg,     setMsg]     = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    try {
      // The PIN used to live under a single global key while the rest
      // of parental control (parental.blocked, parental.profiles,
      // prefs.ratingCap) is per-tenant — so two accounts sharing a
      // browser shared one PIN, and whoever set it gated the other.
      // Adopt any legacy value into this tenant's key on first read so
      // an already-configured PIN keeps working.
      const legacy = localStorage.getItem(LEGACY_PIN_KEY);
      if (legacy && !localStorage.getItem(userKey(PIN_KEY))) {
        localStorage.setItem(userKey(PIN_KEY), legacy);
        localStorage.removeItem(LEGACY_PIN_KEY);
      }
      setHasPin(!!localStorage.getItem(userKey(PIN_KEY)));
    } catch { /* ignore */ }
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!/^\d{4}$/.test(pin)) {
      setMsg({ ok: false, text: 'PIN must be exactly 4 digits.' });
      return;
    }
    if (pin !== confirm) {
      setMsg({ ok: false, text: 'The two PINs don\'t match.' });
      return;
    }
    const hash = await sha256Hex(pin);
    try {
      localStorage.setItem(userKey(PIN_KEY), hash);
      setHasPin(true);
      setPin(''); setConfirm('');
      setMsg({ ok: true, text: 'PIN saved. The app will now ask for it before showing blocked channels.' });
    } catch {
      setMsg({ ok: false, text: 'Couldn\'t save the PIN — browser storage may be locked.' });
    }
  }

  function clear() {
    // `confirm` here is the confirm-PIN input's state, which shadows
    // window.confirm. Guarding on it meant that whenever that field
    // had any text the `&&` short-circuited and the PIN was removed
    // with no prompt at all.
    if (!window.confirm('Remove the PIN? Blocked channels will become hidden-only again.')) return;
    try {
      localStorage.removeItem(userKey(PIN_KEY));
      localStorage.removeItem(userKey(UNLOCK_KEY));
      setHasPin(false);
      setMsg({ ok: true, text: 'PIN removed.' });
    } catch { /* ignore */ }
  }

  return (
    <>
      <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, margin: '0 0 16px' }}>
        A 4-digit PIN the app asks for before unlocking blocked channels or
        playing content above the rating cap. Stored as a SHA-256 hash on
        this device only — never sent to our servers.
      </p>
      {hasPin ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--ns-ok, #7DF9C6)', fontSize: 14, fontWeight: 600 }}>
            ✓ PIN is set.
          </span>
          <button className="ac-btn ac-btn-sm" onClick={clear}>Remove PIN</button>
        </div>
      ) : (
        <form onSubmit={save} style={{ display: 'grid', gap: 12, maxWidth: 320 }}>
          <div className="ac-field">
            <label className="ac-field-label">New 4-digit PIN</label>
            <input
              className="ac-input"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
            />
          </div>
          <div className="ac-field">
            <label className="ac-field-label">Confirm</label>
            <input
              className="ac-input"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={4}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
            />
          </div>
          <button type="submit" className="ac-btn ac-btn-primary">Set PIN</button>
        </form>
      )}
      {msg && (
        <div style={{
          marginTop: 12,
          color: msg.ok ? 'var(--ns-ok, #7DF9C6)' : 'var(--ns-danger, #FF6B7B)',
          fontSize: 13,
        }}>{msg.text}</div>
      )}
    </>
  );
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
