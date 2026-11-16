'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import { favKey, isFavorite, onFavoritesChange, toggleFavorite, type VodFavorite } from '@/lib/vodFavorites';

/** "My list" toggle for a movie or series. */
export default function FavButton({ item }: { item: Omit<VodFavorite, 'key' | 'at'> }) {
  const { t } = useT();
  const key = favKey(item.provider, item.kind, item.id);
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(isFavorite(key));
    return onFavoritesChange(() => setOn(isFavorite(key)));
  }, [key]);
  return (
    <button
      type="button"
      className="vod-btn ghost"
      aria-pressed={on}
      onClick={() => setOn(toggleFavorite(item))}
    >
      {on ? '♥' : '♡'} {on ? t('vod.inMyList') : t('vod.addMyList')}
    </button>
  );
}
