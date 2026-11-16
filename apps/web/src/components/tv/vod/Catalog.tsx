'use client';

// Poster catalogue shared by Movies and Series.
//
// Providers routinely ship 10 000+ titles, so the grid renders in pages
// of 60 and adds more as the user nears the end (IntersectionObserver),
// instead of mounting every poster at once. Images load lazily.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/lib/i18n';
import type { Category } from '@/lib/providers/types';

export interface CatalogItem {
  id: string; name: string; poster: string; categoryId: string;
  rating: number | null; year: number | null; added?: number | null;
  progress?: number;   // 0..1
}

const PAGE = 60;

export function Poster({ item, onOpen }: { item: CatalogItem; onOpen: (i: CatalogItem) => void }) {
  const [broken, setBroken] = useState(false);
  return (
    <button type="button" className="vod-card" onClick={() => onOpen(item)} aria-label={item.name}>
      <div className="vod-poster">
        {item.poster && !broken
          ? <img src={item.poster} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
          : <div className="vod-poster-fallback" aria-hidden="true">{item.name}</div>}
        {item.rating ? <span className="vod-badge">★ {item.rating.toFixed(1)}</span> : null}
        {item.progress ? <span className="vod-progress"><i style={{ width: `${Math.round(item.progress * 100)}%` }} /></span> : null}
      </div>
      <div className="vod-name">{item.name}</div>
      {item.year ? <div className="vod-meta">{item.year}</div> : null}
    </button>
  );
}

export default function Catalog({
  items, categories, loading, onOpen, title,
}: {
  items: CatalogItem[]; categories: Category[]; loading: boolean;
  onOpen: (i: CatalogItem) => void; title: string;
}) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [sort, setSort] = useState<'added' | 'name' | 'rating' | 'year'>('added');
  const [shown, setShown] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.categoryId, (m.get(i.categoryId) ?? 0) + 1);
    return m;
  }, [items]);
  const usedCats = useMemo(() => categories.filter((c) => counts.get(c.id)), [categories, counts]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = cat ? items.filter((i) => i.categoryId === cat) : items;
    if (needle) list = list.filter((i) => i.name.toLowerCase().includes(needle));
    const by = {
      added:  (a: CatalogItem, b: CatalogItem) => (b.added ?? 0) - (a.added ?? 0),
      name:   (a: CatalogItem, b: CatalogItem) => a.name.localeCompare(b.name),
      rating: (a: CatalogItem, b: CatalogItem) => (b.rating ?? -1) - (a.rating ?? -1),
      year:   (a: CatalogItem, b: CatalogItem) => (b.year ?? 0) - (a.year ?? 0),
    }[sort];
    return [...list].sort(by);
  }, [items, q, cat, sort]);

  useEffect(() => { setShown(PAGE); }, [q, cat, sort]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setShown((n) => Math.min(n + PAGE, filtered.length));
    }, { rootMargin: '800px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  return (
    <>
      <div className="vod-head">
        <h1 className="vod-title">{title}</h1>
        <div className="vod-tools">
          <input
            className="vod-search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('vod.searchPh')} aria-label={t('vod.searchPh')}
          />
          <select className="vod-select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={t('vod.sort')}>
            <option value="added">{t('vod.sortAdded')}</option>
            <option value="name">{t('vod.sortName')}</option>
            <option value="rating">{t('vod.sortRating')}</option>
            <option value="year">{t('vod.sortYear')}</option>
          </select>
        </div>
      </div>
      {usedCats.length > 1 && (
        <div className="vod-chips" role="group" aria-label={t('search.categories')}>
          <button type="button" className="vod-chip" aria-pressed={cat === ''} onClick={() => setCat('')}>{t('search.all')} · {items.length}</button>
          {usedCats.map((c) => (
            <button key={c.id} type="button" className="vod-chip" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
              {c.name} · {counts.get(c.id)}
            </button>
          ))}
        </div>
      )}
      {!loading && <div className="vod-count" aria-live="polite">{filtered.length} {t('vod.titles')}</div>}
      <div className="vod-grid">
        {loading
          ? Array.from({ length: 12 }, (_, i) => <div key={i} className="vod-skel" aria-hidden="true" />)
          : filtered.slice(0, shown).map((i) => <Poster key={i.id} item={i} onOpen={onOpen} />)}
      </div>
      {!loading && filtered.length === 0 && <div className="vod-count" style={{ paddingTop: 12 }}>{t('search.noResults')}</div>}
      <div ref={sentinel} className="vod-more" />
    </>
  );
}
