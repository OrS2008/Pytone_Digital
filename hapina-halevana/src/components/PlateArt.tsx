import { plateBackground, cn } from "@/lib/utils";

type Props = {
  hue: number;
  label: string;
  className?: string;
  /** show a subtle plate ring + rising steam */
  detailed?: boolean;
};

/**
 * Deterministic cinematic "plate" placeholder rendered from a dish hue.
 * Swap for a real <Image> when magazine photography is available — the aspect
 * box and rounded frame are already correct.
 */
export function PlateArt({ hue, label, className, detailed = true }: Props) {
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ background: plateBackground(hue) }}
      role="img"
      aria-label={`${label} — plated`}
    >
      {/* warm top light */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 45% at 50% 8%, rgba(255,240,210,0.28), transparent 70%)",
        }}
      />
      {detailed && (
        <svg className="absolute inset-0 h-full w-full opacity-[0.9]" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <defs>
            <radialGradient id={`p-${hue}`} cx="50%" cy="55%" r="55%">
              <stop offset="0%" stopColor="rgba(0,0,0,0)" />
              <stop offset="78%" stopColor="rgba(0,0,0,0)" />
              <stop offset="80%" stopColor="rgba(255,255,255,0.10)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.35)" />
            </radialGradient>
          </defs>
          <circle cx="100" cy="112" r="72" fill={`url(#p-${hue})`} />
          {/* steam */}
          <g className="animate-ember" stroke="rgba(255,255,255,0.14)" strokeWidth="2.4" fill="none" strokeLinecap="round">
            <path d="M84 66 q8 -12 0 -24 q-8 -12 0 -24" />
            <path d="M100 60 q8 -12 0 -24 q-8 -12 0 -24" />
            <path d="M116 66 q8 -12 0 -24 q-8 -12 0 -24" />
          </g>
        </svg>
      )}
      {/* grain */}
      <div className="grain-layer" />
    </div>
  );
}
