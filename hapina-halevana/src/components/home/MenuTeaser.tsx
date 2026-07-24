import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionHeading } from "@/components/SectionHeading";
import { Reveal } from "@/components/Reveal";
import { menuCategories, menuItems } from "@/content/menu";

export function MenuTeaser() {
  const count = (id: string) => menuItems.filter((i) => i.category === id).length;

  return (
    <section className="container-luxe py-24 md:py-32">
      <SectionHeading
        eyebrow="The menu"
        title="Eleven ways to feast"
        intro="From the legendary shawarma to hand-cut salads and slow-cooked hummus — every category, carved and plated to order."
        align="center"
        className="mb-14"
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {menuCategories.map((c, i) => (
          <Reveal key={c.id} delay={(i % 4) * 0.06}>
            <Link
              href={`/menu#${c.id}`}
              className="group flex h-full flex-col justify-between rounded-xl2 hairline bg-surface p-5 transition-colors hover:border-gold/50 hover:bg-surface/80"
            >
              <div className="flex items-start justify-between">
                <span className="text-xs text-cream/40">{String(count(c.id)).padStart(2, "0")}</span>
                <ArrowRight
                  size={16}
                  className="text-cream/30 transition-all group-hover:translate-x-0.5 group-hover:text-gold"
                />
              </div>
              <div className="mt-8">
                <h3 className="font-display text-xl text-cream group-hover:text-gold">{c.name}</h3>
                <p className="mt-1 text-sm text-cream/50" dir="rtl">{c.nameHe}</p>
                <p className="mt-3 text-xs leading-relaxed text-cream/45">{c.blurb}</p>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
      <div className="mt-10 text-center">
        <Link
          href="/menu"
          className="inline-flex items-center gap-2 rounded-full bg-gold px-7 py-3.5 font-medium text-ink transition-transform hover:scale-[1.03] active:scale-95"
        >
          Open the full menu <ArrowRight size={18} />
        </Link>
      </div>
    </section>
  );
}
