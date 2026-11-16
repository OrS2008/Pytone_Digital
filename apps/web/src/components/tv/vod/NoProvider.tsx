'use client';

import Link from 'next/link';
import { useT } from '@/lib/i18n';

/** Honest empty state: VOD needs an Xtream / Stalker provider that offers it. */
export default function NoProvider({ kind, error }: { kind: 'movies' | 'series'; error?: string | null }) {
  const { t } = useT();
  return (
    <div className="vod-empty">
      <h2>{kind === 'movies' ? t('vod.noMoviesTitle') : t('vod.noSeriesTitle')}</h2>
      <p>{error || t('vod.noProviderBody')}</p>
      <Link className="vod-btn" href="/tv/account/sources">{t('vod.connectProvider')}</Link>
    </div>
  );
}
