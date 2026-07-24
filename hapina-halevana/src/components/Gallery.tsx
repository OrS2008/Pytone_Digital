"use client";

import { motion } from "framer-motion";
import { cn, plateBackground } from "@/lib/utils";

/**
 * Masonry-style luxury gallery.
 * Each tile is a generated cinematic scene (hue + caption). Replace any tile
 * with a real <Image> using the same grid span classes for instant upgrade.
 */
export type GalleryTile = {
  caption: string;
  hue: number;
  span?: "tall" | "wide" | "normal";
};

export const galleryTiles: GalleryTile[] = [
  { caption: "Shawarma, carved to order", hue: 30, span: "tall" },
  { caption: "Laffa off the fire", hue: 38 },
  { caption: "Hummus masabacha", hue: 46 },
  { caption: "Flames on the grill", hue: 12, span: "wide" },
  { caption: "Hand-cut Israeli salad", hue: 120 },
  { caption: "Golden falafel", hue: 100, span: "tall" },
  { caption: "The white corner at night", hue: 220 },
  { caption: "Fresh pita, warm", hue: 40 },
  { caption: "Pine nuts & tahini", hue: 44, span: "wide" },
  { caption: "Knafeh, rosewater & pistachio", hue: 26 },
  { caption: "The team on a Friday", hue: 200 },
  { caption: "Lemonana, ice cold", hue: 140, span: "tall" },
];

export function Gallery({ tiles = galleryTiles }: { tiles?: GalleryTile[] }) {
  return (
    <div className="[column-fill:_balance] gap-4 sm:columns-2 lg:columns-3">
      {tiles.map((t, i) => (
        <motion.figure
          key={i}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.7, delay: (i % 3) * 0.08, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "group relative mb-4 block break-inside-avoid overflow-hidden rounded-xl2 hairline",
            t.span === "tall" ? "aspect-[3/4]" : t.span === "wide" ? "aspect-[4/3]" : "aspect-square"
          )}
        >
          <div
            className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-110"
            style={{ background: plateBackground(t.hue) }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-transparent to-transparent opacity-70 transition-opacity group-hover:opacity-90" />
          <div className="grain-layer" />
          <figcaption className="absolute inset-x-0 bottom-0 translate-y-2 p-5 text-sm text-cream/90 opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
            {t.caption}
          </figcaption>
        </motion.figure>
      ))}
    </div>
  );
}
