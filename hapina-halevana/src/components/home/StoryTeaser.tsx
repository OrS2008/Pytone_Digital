import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { values } from "@/content/story";
import { restaurant } from "@/content/restaurant";

export function StoryTeaser() {
  return (
    <section className="relative overflow-hidden border-y border-white/8 bg-surface-2 py-24 md:py-32">
      <div
        className="pointer-events-none absolute -right-40 top-0 h-[40rem] w-[40rem] rounded-full opacity-40"
        style={{ background: "radial-gradient(circle, rgba(200,155,60,0.18), transparent 60%)" }}
        aria-hidden
      />
      <div className="container-luxe grid items-center gap-16 lg:grid-cols-2">
        <div>
          <Reveal>
            <p className="mb-4 flex items-center gap-3 text-xs uppercase tracking-[0.35em] text-gold">
              <span className="h-px w-8 bg-gold/50" /> Our story
            </p>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="font-display text-[clamp(2rem,4.5vw,3.5rem)] font-semibold leading-tight text-cream">
              A corner, a fire, and{" "}
              <span className="text-gradient-gold">four generations</span> of Yehud.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-cream/65">
              {restaurant.descriptionLong}
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <Link
              href="/story"
              className="group mt-8 inline-flex items-center gap-2 rounded-full border border-gold/40 px-6 py-3 font-medium text-cream transition-colors hover:border-gold hover:text-gold"
            >
              Read the full story
              <ArrowUpRight size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </Reveal>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2">
          {values.map((v, i) => (
            <Reveal as="li" key={v.title} delay={i * 0.08}>
              <div className="hairline h-full rounded-xl2 bg-ink/60 p-6">
                <div className="font-display text-lg text-gold">{v.title}</div>
                <p className="mt-2 text-sm leading-relaxed text-cream/60">{v.body}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
