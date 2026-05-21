'use client';

import { TvRow } from './TvFocus';

interface Props {
  zoneId: string;
  title: string;
  upZone?: string;
  downZone?: string;
  count?: number;
}

export default function TvHomeRow({ zoneId, title, upZone, downZone, count = 12 }: Props) {
  const items = Array.from({ length: count }).map((_, i) => (
    <>
      <img
        src={`https://picsum.photos/seed/${encodeURIComponent(title)}-${i}/640/360`}
        alt=""
        loading="lazy"
      />
      <div className="tv-tile-gradient" />
      <div className="tv-tile-caption">{`${title} #${i + 1}`}</div>
    </>
  ));

  return (
    <div className="tv-row">
      <h2>{title}</h2>
      <TvRow
        zoneId={zoneId}
        items={items}
        itemWidth={320}
        upZone={upZone}
        downZone={downZone}
      />
    </div>
  );
}
