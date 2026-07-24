import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { Reveal } from "@/components/Reveal";
import { OrderCta } from "@/components/home/OrderCta";
import { timeline, values } from "@/content/story";
import { restaurant } from "@/content/restaurant";
import { cn, plateBackground } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Our Story",
  description: `From a single spit in 1987 to a Yehud institution — the story of ${restaurant.name}, the White Corner.`,
  alternates: { canonical: "/story" },
};

const eraLabel = { past: "The past", present: "Today", future: "Tomorrow" } as const;

export default function StoryPage() {
  return (
    <>
      <PageHero
        eyebrow={`Since ${restaurant.founded}`}
        title="A corner, a fire, and four generations of Yehud."
        intro={restaurant.descriptionLong}
      />

      {/* Timeline */}
      <section className="container-luxe py-20 md:py-28">
        <div className="relative mx-auto max-w-3xl">
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-gold/60 via-gold/20 to-transparent md:left-1/2" aria-hidden />
          <ol className="space-y-14">
            {timeline.map((t, i) => (
              <Reveal as="li" key={t.year} delay={0.05}>
                <div
                  className={cn(
                    "relative md:grid md:grid-cols-2 md:gap-12",
                    i % 2 === 1 && "md:[&>*:first-child]:col-start-2"
                  )}
                >
                  <div className={cn("pl-10 md:pl-0", i % 2 === 0 ? "md:pr-12 md:text-right" : "md:col-start-2 md:pl-12")}>
                    <span className="absolute left-0 top-1.5 h-4 w-4 rounded-full border-2 border-gold bg-ink md:left-1/2 md:-translate-x-1/2" />
                    <span className="text-xs uppercase tracking-[0.3em] text-gold/70">{eraLabel[t.era]}</span>
                    <h2 className="mt-2 font-display text-3xl text-cream">{t.year}</h2>
                    <h3 className="mt-1 font-display text-xl text-gold">{t.title}</h3>
                    <p className="mt-3 text-[15px] leading-relaxed text-cream/65">{t.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Vintage frames */}
      <section className="border-y border-white/8 bg-surface-2 py-20 md:py-28">
        <div className="container-luxe">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { c: "The original corner, 1987", h: 32 },
              { c: "The Friday line down the block", h: 26 },
              { c: "The fire that never went out", h: 14 },
            ].map((f, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <figure className="overflow-hidden rounded-xl2 hairline">
                  <div
                    className="relative aspect-[4/5] grayscale-[0.35] sepia-[0.15]"
                    style={{ background: plateBackground(f.h) }}
                  >
                    <div className="grain-layer" style={{ opacity: 0.12 }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-ink/70 to-transparent" />
                  </div>
                  <figcaption className="bg-ink/60 px-5 py-4 text-sm text-cream/60">{f.c}</figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="container-luxe py-20 md:py-28">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {values.map((v, i) => (
            <Reveal key={v.title} delay={i * 0.08}>
              <div className="hairline h-full rounded-xl2 bg-surface p-7">
                <div className="font-display text-4xl text-gold/30">0{i + 1}</div>
                <h3 className="mt-4 font-display text-xl text-cream">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-cream/60">{v.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <OrderCta />
    </>
  );
}
