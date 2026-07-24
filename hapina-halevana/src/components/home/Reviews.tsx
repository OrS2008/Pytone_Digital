"use client";

import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { SectionHeading } from "@/components/SectionHeading";
import { reviews } from "@/content/reviews";
import { restaurant } from "@/content/restaurant";

function Stars({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${n} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={15} className={i < n ? "fill-gold text-gold" : "text-cream/20"} />
      ))}
    </div>
  );
}

export function Reviews() {
  return (
    <section className="relative overflow-hidden border-y border-white/8 bg-surface-2 py-24 md:py-32">
      <div className="container-luxe">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <SectionHeading
            eyebrow="Loved in Yehud"
            title="What the neighborhood says"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-4 rounded-xl2 hairline bg-ink/60 px-6 py-4"
          >
            <div className="font-display text-4xl text-gold">{restaurant.proof.rating.toFixed(1)}</div>
            <div>
              <Stars n={5} />
              <p className="mt-1 text-xs text-cream/60">
                {restaurant.proof.reviewCount.toLocaleString()} Google reviews
              </p>
            </div>
          </motion.div>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {reviews.map((r, i) => (
            <motion.blockquote
              key={r.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.7, delay: (i % 3) * 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="flex h-full flex-col rounded-xl2 hairline bg-ink/60 p-6"
            >
              <Stars n={r.rating} />
              <p className="mt-4 flex-1 text-[15px] leading-relaxed text-cream/80">“{r.text}”</p>
              <footer className="mt-6 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-gold/15 font-display text-gold">
                  {r.initial}
                </span>
                <span className="text-sm">
                  <span className="block text-cream">{r.name}</span>
                  <span className="block text-xs text-cream/45">{r.source} · {r.when}</span>
                </span>
              </footer>
            </motion.blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
