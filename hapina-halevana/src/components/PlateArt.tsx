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
 * Reads like moody, out-of-focus studio food photography. Swap for a real
 * <Image> when magazine photography is available — the aspect box and rounded
 * frame are already correct.
 */
export function PlateArt({ hue, label, className, detailed = true }: Props) {
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ background: plateBackground(hue) }}
      role="img"
      aria-label={`${label} — plated`}
    >
      {detailed && (
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 200 200"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
        >
          <defs>
            <radialGradient id={`rim-${hue}`} cx="50%" cy="52%" r="52%">
              <stop offset="0%" stopColor="rgba(0,0,0,0)" />
              <stop offset="82%" stopColor="rgba(0,0,0,0)" />
              <stop offset="86%" stopColor="rgba(255,246,228,0.10)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.32)" />
            </radialGradient>
          </defs>
          {/* ceramic plate rim */}
          <circle cx="100" cy="104" r="82" fill={`url(#rim-${hue})`} />
          {/* steam */}
          <g
            className="animate-ember"
            stroke="rgba(255,250,240,0.10)"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          >
            <path d="M86 58 q7 -11 0 -22 q-7 -11 0 -22" />
            <path d="M100 52 q7 -11 0 -22 q-7 -11 0 -22" />
            <path d="M114 58 q7 -11 0 -22 q-7 -11 0 -22" />
          </g>
        </svg>
      )}
      {/* diagonal specular sweep */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(115deg, transparent 40%, rgba(255,248,232,0.06) 50%, transparent 60%)",
        }}
      />
      {/* grain */}
      <div className="grain-layer" />
    </div>
  );
}
