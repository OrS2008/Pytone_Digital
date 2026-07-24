import { Reveal } from "./Reveal";

type Props = {
  eyebrow: string;
  title: string;
  intro?: string;
  hue?: number;
};

export function PageHero({ eyebrow, title, intro, hue = 30 }: Props) {
  return (
    <header className="relative overflow-hidden pb-16 pt-36 md:pb-20 md:pt-44 grain">
      <div className="absolute inset-0" aria-hidden>
        <div
          className="absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 animate-ember rounded-full opacity-50"
          style={{ background: `radial-gradient(circle, hsl(${hue} 70% 45% / 0.22), transparent 60%)` }}
        />
        <div className="grain-layer" />
      </div>
      <div className="container-luxe relative">
        <Reveal>
          <p className="mb-4 flex items-center gap-3 text-xs uppercase tracking-[0.4em] text-gold">
            <span className="h-px w-10 bg-gold/60" />
            {eyebrow}
          </p>
        </Reveal>
        <Reveal delay={0.05}>
          <h1 className="max-w-4xl font-display text-[clamp(2.5rem,7vw,5rem)] font-semibold leading-[1.02] text-cream">
            {title}
          </h1>
        </Reveal>
        {intro && (
          <Reveal delay={0.1}>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-cream/70">{intro}</p>
          </Reveal>
        )}
      </div>
    </header>
  );
}
