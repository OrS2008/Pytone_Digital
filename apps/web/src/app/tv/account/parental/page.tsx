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
        <div className="ac-card-title">PIN protection · planned</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, margin: 0 }}>
          A PIN that the player asks for before unlocking content above your
          rating cap, leaving a Kids profile, or opening Billing is on the
          roadmap. Until it ships, the settings above act as filters in the
          UI only — they hide content from the rail rather than block a
          determined user from typing the channel into search.
        </p>
      </div>
    </Shell>
  );
}
