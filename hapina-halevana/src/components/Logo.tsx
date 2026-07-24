import { restaurant } from "@/content/restaurant";

type Props = {
  variant?: "gold" | "light" | "dark" | "mono";
  showWordmark?: boolean;
  className?: string;
  markSize?: number;
};

const palettes = {
  gold: { mark: "#c89b3c", markAlt: "#e59b3a", word: "#fafafa", sub: "#c89b3c" },
  light: { mark: "#fafafa", markAlt: "#fafafa", word: "#fafafa", sub: "#c89b3c" },
  dark: { mark: "#0d0d0d", markAlt: "#0d0d0d", word: "#0d0d0d", sub: "#556b2f" },
  mono: { mark: "currentColor", markAlt: "currentColor", word: "currentColor", sub: "currentColor" },
} as const;

/**
 * HaPina HaLevana identity mark.
 * The glyph is an abstract "white corner": two walls meeting at a right angle,
 * with a shawarma spit rising through the corner — an emblem, not a photo.
 */
export function Logo({ variant = "gold", showWordmark = true, className, markSize = 40 }: Props) {
  const p = palettes[variant];
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
      <svg
        width={markSize}
        height={markSize}
        viewBox="0 0 48 48"
        fill="none"
        role="img"
        aria-label={`${restaurant.name} emblem`}
      >
        {/* the corner */}
        <path
          d="M8 40V12a4 4 0 0 1 4-4h28"
          stroke={p.mark}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path d="M8 40h28" stroke={p.mark} strokeWidth="2.5" strokeLinecap="round" />
        {/* the spit / flame */}
        <path
          d="M24 14c3.6 2.2 5.4 5.2 5.4 9 0 4.6-2.4 7.8-5.4 10-3-2.2-5.4-5.4-5.4-10 0-3.8 1.8-6.8 5.4-9Z"
          fill={p.markAlt}
          opacity="0.92"
        />
        <circle cx="24" cy="11" r="1.8" fill={p.mark} />
      </svg>
      {showWordmark && (
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <span
            className="font-display"
            style={{ color: p.word, fontSize: markSize * 0.44, letterSpacing: "0.01em", fontWeight: 600 }}
          >
            HaPina HaLevana
          </span>
          <span
            style={{
              color: p.sub,
              fontSize: markSize * 0.235,
              letterSpacing: "0.34em",
              textTransform: "uppercase",
              marginTop: 3,
            }}
          >
            The White Corner
          </span>
        </span>
      )}
    </span>
  );
}
