"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Flame, Star, Leaf, Sprout, WheatOff, Info, MessageCircle } from "lucide-react";
import { PlateArt } from "@/components/PlateArt";
import {
  menuCategories,
  menuItems,
  dietLabels,
  allergenLabels,
  type Diet,
  type MenuItem,
} from "@/content/menu";
import { shekel, whatsappOrderLink, cn } from "@/lib/utils";

const dietIcon: Record<Diet, typeof Leaf> = {
  vegetarian: Leaf,
  vegan: Sprout,
  spicy: Flame,
  "gluten-free": WheatOff,
};

const dietFilters: Diet[] = ["vegetarian", "vegan", "gluten-free", "spicy"];

export function MenuExplorer() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [diet, setDiet] = useState<Diet | null>(null);
  const [openInfo, setOpenInfo] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menuItems.filter((i) => {
      if (cat !== "all" && i.category !== cat) return false;
      if (diet && !i.diet?.includes(diet)) return false;
      if (q) {
        const hay = `${i.name} ${i.nameHe} ${i.description} ${i.ingredients.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [query, cat, diet]);

  // group filtered by category, preserving category order
  const grouped = useMemo(() => {
    return menuCategories
      .map((c) => ({ cat: c, items: filtered.filter((i) => i.category === c.id) }))
      .filter((g) => g.items.length > 0);
  }, [filtered]);

  return (
    <div>
      {/* Controls */}
      <div className="sticky top-[68px] z-30 -mx-5 mb-10 border-y border-white/8 bg-ink/85 px-5 py-4 backdrop-blur-md md:top-[76px]">
        <div className="container-luxe !px-0">
          <div className="flex flex-col gap-3">
            <label className="relative block">
              <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cream/40" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search dishes, ingredients…"
                aria-label="Search the menu"
                className="w-full rounded-full border border-white/10 bg-surface py-3 pl-11 pr-4 text-sm text-cream placeholder:text-cream/40 focus:border-gold/60 focus:outline-none"
              />
            </label>

            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Chip active={cat === "all"} onClick={() => setCat("all")}>
                All
              </Chip>
              {menuCategories.map((c) => (
                <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
                  {c.name}
                </Chip>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {dietFilters.map((d) => {
                const Icon = dietIcon[d];
                const active = diet === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDiet(active ? null : d)}
                    aria-pressed={active}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "border-olive bg-olive/20 text-olive"
                        : "border-white/10 text-cream/60 hover:border-white/25"
                    )}
                  >
                    <Icon size={13} /> {dietLabels[d]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      {grouped.length === 0 ? (
        <p className="py-16 text-center text-cream/50">
          No dishes match “{query}”. Try another search.
        </p>
      ) : (
        <div className="space-y-16">
          {grouped.map(({ cat: c, items }) => (
            <section key={c.id} id={c.id} className="scroll-mt-40">
              <div className="mb-6 flex items-baseline justify-between gap-4 border-b border-white/8 pb-3">
                <div>
                  <h2 className="font-display text-2xl text-cream md:text-3xl">{c.name}</h2>
                  <p className="text-sm text-cream/45">{c.blurb}</p>
                </div>
                <span className="text-sm text-cream/40" dir="rtl">{c.nameHe}</span>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    open={openInfo === item.id}
                    onToggle={() => setOpenInfo(openInfo === item.id ? null : item.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-gold text-ink" : "bg-surface text-cream/70 hover:text-cream"
      )}
    >
      {children}
    </button>
  );
}

function ItemCard({ item, open, onToggle }: { item: MenuItem; open: boolean; onToggle: () => void }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl2 hairline bg-surface">
      <div className="relative aspect-[16/10] overflow-hidden">
        <PlateArt hue={item.hue} label={item.name} className="h-full w-full transition-transform duration-700 group-hover:scale-105" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {item.popular && (
            <span className="flex items-center gap-1 rounded-full bg-ink/75 px-2.5 py-1 text-[11px] font-medium text-gold backdrop-blur">
              <Flame size={11} /> Popular
            </span>
          )}
          {item.favorite && (
            <span className="flex items-center gap-1 rounded-full bg-ink/75 px-2.5 py-1 text-[11px] font-medium text-gold backdrop-blur">
              <Star size={11} className="fill-gold" /> Favorite
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg text-cream">{item.name}</h3>
            <p className="text-xs text-cream/45" dir="rtl">{item.nameHe}</p>
          </div>
          <span className="font-display text-lg text-gold">{shekel(item.price)}</span>
        </div>

        <p className="mt-2 flex-1 text-sm leading-relaxed text-cream/60">{item.description}</p>

        {/* diet tags */}
        {item.diet && item.diet.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.diet.map((d) => {
              const Icon = dietIcon[d];
              return (
                <span key={d} className="flex items-center gap-1 rounded-full bg-olive/15 px-2 py-0.5 text-[11px] text-olive">
                  <Icon size={11} /> {dietLabels[d]}
                </span>
              );
            })}
          </div>
        )}

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-4 space-y-3 border-t border-white/8 pt-4 text-sm">
                <div>
                  <span className="text-xs uppercase tracking-wider text-gold">Ingredients</span>
                  <p className="mt-1 text-cream/70">{item.ingredients.join(" · ")}</p>
                </div>
                {item.allergens && item.allergens.length > 0 && (
                  <div>
                    <span className="text-xs uppercase tracking-wider text-gold">Allergens</span>
                    <p className="mt-1 text-cream/70">
                      {item.allergens.map((a) => allergenLabels[a]).join(", ")}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-5 flex items-center gap-2">
          <a
            href={whatsappOrderLink([item])}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-gold px-4 py-2.5 text-sm font-semibold text-ink transition-transform hover:scale-[1.02] active:scale-95"
          >
            <MessageCircle size={16} /> Order
          </a>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} details for ${item.name}`}
            className="flex items-center justify-center gap-1.5 rounded-full border border-white/12 px-4 py-2.5 text-sm text-cream/70 hover:border-gold/50 hover:text-gold"
          >
            <Info size={16} /> {open ? "Less" : "Details"}
          </button>
        </div>
      </div>
    </article>
  );
}
