const words = [
  "Carved to order",
  "Fresh every dawn",
  "Generous portions",
  "Since 1987",
  "Kosher",
  "Yehud's legend",
  "Over open flame",
  "Family recipe",
];

export function Marquee() {
  const strip = [...words, ...words];
  return (
    <div className="relative border-y border-white/8 bg-surface-2 py-5" aria-hidden>
      <div className="flex w-max animate-marquee gap-8 whitespace-nowrap">
        {strip.map((w, i) => (
          <span key={i} className="flex items-center gap-8 font-display text-2xl text-cream/40">
            {w}
            <span className="text-gold">✦</span>
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-surface-2 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-surface-2 to-transparent" />
    </div>
  );
}
