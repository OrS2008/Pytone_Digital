# HaPina HaLevana — Brand Guidelines

**הפינה הלבנה · The White Corner** — the legendary shawarma experience of Yehud.

## Positioning

> This is not just food. This is an experience.

Authentic · Premium · Warm · Traditional · Trustworthy · Modern · Family-oriented · Memorable.

## Logo

An abstract emblem, never a photograph: two walls meeting at a right angle (the
"white corner") with a shawarma spit / flame rising through it.

- **Component:** `src/components/Logo.tsx` — variants `gold` (default), `light`,
  `dark`, `mono`; wordmark optional; scalable via `markSize`.
- **Favicon:** `public/favicon.svg`; PNG icons generated at `/icon`,
  `/apple-icon`, `/icons/{size}`.
- Clear space ≥ the height of the mark. Never recolor the flame outside the
  gold→ember range. Monochrome version for single-color contexts.

## Color system

| Token | Hex | Use |
| ----- | --- | --- |
| Ink (primary bg) | `#0D0D0D` | Page background |
| Dark surface | `#1A1A1A` | Cards, panels |
| Luxury gold | `#C89B3C` | Primary accent, CTAs, headings highlight |
| Warm orange / ember | `#E59B3A` | Fire, energy, gradients |
| Cream | `#FAFAFA` | Primary text |
| Olive accent | `#556B2F` | Fresh / vegetarian / "open now" |

Defined as Tailwind v4 tokens in `src/app/globals.css` → `bg-ink`, `text-gold`,
`text-cream`, `border-ember`, `text-olive`, etc. Gradients and gold lighting
effects (`.text-gradient-gold`, `.glow-gold`, ember glows) build the premium,
cinematic feel.

**Contrast:** cream on ink and gold on ink meet WCAG 2.2 AA for text.

## Typography

- **Display / headlines:** **Playfair Display** (`font-display`) — large,
  editorial, cinematic. Weights 400–700.
- **Body / UI:** **Inter** (`font-body`) — clean, legible, modern.
- Loaded via `next/font/google` (self-hosted at build, no layout shift).
- Hierarchy uses fluid `clamp()` sizing; generous line-height and letter-spacing
  on eyebrows (uppercase, `0.3–0.4em` tracking).

## Iconography

**Lucide** line icons at consistent stroke; gold or cream depending on emphasis.

## Photography direction

Michelin-grade, natural light, real textures, shallow depth of field. Scenes:
shawarma carving, laffa off the fire, grill flames, hummus, hand-cut salads,
fresh pita, ingredients, the corner at night, staff, happy customers. Until real
photography ships, deterministic cinematic "plate" art is generated per dish
(`lib/utils.ts` → `plateBackground`, `components/PlateArt.tsx`).

## Motion

Framer Motion. Signature moves: scroll-reveal fade+rise (`cubic-bezier(0.16,1,0.3,1)`),
hero parallax + ember particles, gold ambient glows, image scale-on-hover,
accordion expand. **All motion respects `prefers-reduced-motion`.**

## Voice

Warm, confident, rooted in Yehud. Short cinematic lines. Hebrew names shown
alongside English. Never salesy — the food does the selling.
