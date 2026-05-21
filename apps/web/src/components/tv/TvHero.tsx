'use client';

import { useEffect, useState } from 'react';
import { useCurrentZone, useSetZone } from './TvFocus';

const ZONE = 'hero';

export default function TvHero() {
  const focusHero = useSetZone(ZONE);
  const current = useCurrentZone();
  const [btn, setBtn] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (current !== ZONE) return;
      if (e.key === 'ArrowLeft'  && btn > 0) setBtn(btn - 1);
      if (e.key === 'ArrowRight' && btn < 1) setBtn(btn + 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [btn, current]);

  return (
    <section className="tv-hero" onMouseEnter={focusHero}>
      <img src="https://picsum.photos/seed/novastream-tv-hero/1920/1080" alt="" />
      <div className="tv-hero-shade" />
      <div className="tv-hero-content">
        <div className="tv-hero-eyebrow">Live now</div>
        <h1 className="tv-hero-title">Premier League · Sunday Big Match</h1>
        <p className="tv-hero-sub">
          Multi-angle, instant replay, AI-generated highlights from kick-off.
        </p>
        <div className="tv-hero-actions">
          <button
            className={`tv-btn tv-btn-primary ${current === ZONE && btn === 0 ? 'focused' : ''}`}
          >Play</button>
          <button
            className={`tv-btn ${current === ZONE && btn === 1 ? 'focused' : ''}`}
          >More info</button>
        </div>
      </div>
    </section>
  );
}
