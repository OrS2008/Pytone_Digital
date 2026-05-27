// Parental controls — PIN-protected profiles, content rating cap, kids
// profile, channel block list, sign-out timer.
//
// State persists to localStorage so settings survive reloads. The real
// backend will replace localStorage with a per-user row in Postgres
// (services/auth/migrations), but the surface stays the same.
'use client';

import { useEffect, useState } from 'react';
import Shell from '../Shell';
import Toggle from '@/components/ui/Toggle';
import ActionButton from '@/components/ui/ActionButton';
import { userKey } from '@/lib/session';

interface Profile {
  id:    string;
  name:  string;
  icon:  string;
  cap:   string;
  primary?: boolean;
  kids?: boolean;
}

const RATING_OPTIONS = [
  '16+ (TV-14 / PG-13)',
  '18+ (TV-MA / R)',
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

export default function Parental() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [blocked,  setBlocked]  = useState<string[]>([]);
  const [query,    setQuery]    = useState('');
  const [adding,   setAdding]   = useState<'profile' | 'kids' | null>(null);
  const [newName,  setNewName]  = useState('');

  useEffect(() => {
    setProfiles(loadProfiles());
    setBlocked(loadBlocked());
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

  return (
    <Shell active="parental">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Parental controls</div>
        <h1 className="ac-panel-title">Family settings</h1>
        <p className="ac-panel-sub">
          Set a PIN to gate adult content, create a Kids profile, and block specific channels.
          Available on the Multi plan with up to 6 profiles per account.
        </p>
      </header>

      <div className="ac-card">
        <div className="ac-card-title">PIN</div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Require PIN for adult content</div>
            <div className="ac-toggle-desc">Anything rated 18+ (TV-MA, R, NC-17) prompts for a 4-digit PIN.</div>
          </div>
          <Toggle initialOn />
        </div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Require PIN to leave the Kids profile</div>
            <div className="ac-toggle-desc">Stops kids switching profiles to access the full catalogue.</div>
          </div>
          <Toggle initialOn />
        </div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Require PIN to change subscription / billing</div>
            <div className="ac-toggle-desc">Prevents accidental upgrades / cancellations.</div>
          </div>
          <Toggle initialOn />
        </div>
        <ActionButton className="ac-btn" style={{ marginTop: 14 }} doneLabel="PIN updated ✓">Change PIN</ActionButton>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Content rating cap</div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">Maximum rating allowed without PIN</div>
            <div className="ac-toggle-desc">Movies and TV beyond this rating require the PIN to open.</div>
          </div>
          <select className="ac-input" style={{ width: 220 }} defaultValue={RATING_OPTIONS[0]}>
            {RATING_OPTIONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Profiles · {profiles.length} / 6</div>
        {profiles.length === 0 ? (
          <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, marginTop: 0 }}>
            No profiles yet. Add an adult profile for yourself and a Kids profile if you want
            child-safe browsing for someone else.
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
                  {p.kids ? 'Kids profile · cap at ' + p.cap : 'Adult · ' + p.cap}
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
        ) : profiles.length < 6 && (
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button className="ac-btn ac-btn-primary" onClick={() => setAdding('profile')}>+ Add profile</button>
            <button className="ac-btn" onClick={() => setAdding('kids')}>+ Add Kids profile</button>
          </div>
        )}
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Channel block list</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, marginTop: 0 }}>
          Hide specific channels from this profile entirely (they don&apos;t appear in the rail or search).
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
    </Shell>
  );
}
