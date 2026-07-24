"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowUpRight, Flame } from "lucide-react";
import { SectionHeading } from "@/components/SectionHeading";
import { PlateArt } from "@/components/PlateArt";
import { menuItems } from "@/content/menu";
import { shekel } from "@/lib/utils";

export function SignatureDishes() {
  const dishes = menuItems.filter((i) => i.recommended || i.favorite).slice(0, 3);

  return (
    <section className="container-luxe py-24 md:py-32">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <SectionHeading
          eyebrow="Signature dishes"
          title="The plates that built the corner"
          intro="Cinematic, generous, carved to order. These are the dishes generations of Yehud keep coming back for."
        />
        <Link href="/menu" className="group hidden items-center gap-2 text-sm text-gold md:flex">
          Explore the full menu
          <ArrowUpRight size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </div>

      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {dishes.map((d, i) => (
          <motion.article
            key={d.id}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.8, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="group relative overflow-hidden rounded-xl2 hairline bg-surface"
          >
            <div className="relative aspect-[4/5] overflow-hidden">
              <PlateArt
                hue={d.hue}
                label={d.name}
                className="h-full w-full transition-transform duration-700 group-hover:scale-105"
              />
              {d.popular && (
                <span className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-ink/70 px-3 py-1.5 text-xs font-medium text-gold backdrop-blur">
                  <Flame size={13} /> Customer favorite
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink to-transparent p-6 pt-16">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <h3 className="font-display text-2xl text-cream">{d.name}</h3>
                    <p className="mt-1 text-sm text-cream/50" dir="rtl">{d.nameHe}</p>
                  </div>
                  <span className="font-display text-xl text-gold">{shekel(d.price)}</span>
                </div>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm leading-relaxed text-cream/65">{d.description}</p>
              <Link
                href="/menu"
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-gold"
              >
                Order this <ArrowUpRight size={15} />
              </Link>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
