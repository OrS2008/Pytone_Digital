'use client';

// Subtitle customisation. Writes four CSS custom properties on
// <html> so the player's ::cue rules pick them up everywhere
// without any per-video wiring:
//
//   --ns-cue-size    e.g. 1em, 1.4em
//   --ns-cue-color   e.g. #ffffff, #c7f538
//   --ns-cue-bg      e.g. transparent, rgba(0,0,0,0.65)
//   --ns-cue-weight  400, 600, 800
//
// Each control is bound to localStorage so the next visit picks up
// the same look. Settings are namespaced per-tenant via userKey().

import { useEffect, useState } from 'react';
import { userKey } from '@/lib/session';

interface Preset {
  id: string;
  label: string;
  size:   string;
  color:  string;
  bg:     string;
  weight: string;
}

const PRESETS: Preset[] = [
  { id: 'default', label: 'Default',    size: '1em',   color: '#ffffff', bg: 'rgba(0,0,0,0.65)',  weight: '600' },
  { id: 'big',     label: 'Bigger',     size: '1.4em', color: '#ffffff', bg: 'rgba(0,0,0,0.7)',   weight: '700' },
  { id: 'yellow',  label: 'Yellow',     size: '1.1em', color: '#FFE066', bg: 'rgba(0,0,0,0.55)',  weight: '700' },
  { id: 'clean',   label: 'No backdrop',size: '1em',   color: '#ffffff', bg: 'transparent',       weight: '700' },
  { id: 'acid',    label: 'High contrast', size: '1.2em', color: '#000000', bg: '#C7F538',        weight: '800' },
];

function applyPreset(p: Preset) {
  const r = document.documentElement;
  r.style.setProperty('--ns-cue-size',   p.size);
  r.style.setProperty('--ns-cue-color',  p.color);
  r.style.setProperty('--ns-cue-bg',     p.bg);
  r.style.setProperty('--ns-cue-weight', p.weight);
}

export default function SubtitleControls() {
  const [active, setActive] = useState('default');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(userKey('subs.preset')) || 'default';
      const p = PRESETS.find((x) => x.id === saved) || PRESETS[0];
      setActive(p.id);
      applyPreset(p);
    } catch { /* ignore */ }
  }, []);

  function pick(id: string) {
    const p = PRESETS.find((x) => x.id === id) || PRESETS[0];
    setActive(p.id);
    applyPreset(p);
    try { localStorage.setItem(userKey('subs.preset'), p.id); } catch { /* ignore */ }
  }

  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10,
      }}>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => pick(p.id)}
            className="ac-btn"
            style={{
              flexDirection: 'column', alignItems: 'stretch', padding: 0, overflow: 'hidden',
              borderColor: active === p.id ? 'var(--ns-accent)' : 'var(--ns-border)',
              boxShadow: active === p.id ? '0 0 0 3px var(--ns-accent-soft)' : 'none',
            }}
            title={p.label}
          >
            <div style={{
              height: 80,
              background:
                'linear-gradient(135deg, #1a1d26 0%, #0e1118 100%)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
              padding: '10px',
            }}>
              <span style={{
                fontSize: p.size, fontWeight: Number(p.weight),
                color: p.color, background: p.bg,
                padding: '4px 8px', borderRadius: 4,
              }}>Sample subtitle</span>
            </div>
            <div style={{
              padding: '10px 12px', fontSize: 13, fontWeight: 600,
              borderTop: '1px solid var(--ns-hairline)',
              color: 'var(--ns-text)', background: 'var(--ns-bg-elevated)',
            }}>
              {p.label}
              {active === p.id && <span style={{ color: 'var(--ns-accent)', marginLeft: 8 }}>✓</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
