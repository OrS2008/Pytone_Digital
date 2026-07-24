import { Reveal } from "./Reveal";
import { cn } from "@/lib/utils";

type Props = {
  eyebrow?: string;
  title: string;
  intro?: string;
  align?: "left" | "center";
  className?: string;
};

export function SectionHeading({ eyebrow, title, intro, align = "left", className }: Props) {
  return (
    <div className={cn(align === "center" && "mx-auto text-center", "max-w-2xl", className)}>
      {eyebrow && (
        <Reveal>
          <p
            className={cn(
              "mb-4 flex items-center gap-3 text-xs uppercase tracking-[0.35em] text-gold",
              align === "center" && "justify-center"
            )}
          >
            <span className="h-px w-8 bg-gold/50" />
            {eyebrow}
          </p>
        </Reveal>
      )}
      <Reveal delay={0.05}>
        <h2 className="font-display text-[clamp(2rem,4.5vw,3.5rem)] font-semibold leading-tight text-cream">
          {title}
        </h2>
      </Reveal>
      {intro && (
        <Reveal delay={0.1}>
          <p className="mt-4 text-base leading-relaxed text-cream/65 md:text-lg">{intro}</p>
        </Reveal>
      )}
    </div>
  );
}
