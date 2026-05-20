# libs/ui-kit

The Pytone design system, as a Flutter package, used by both `apps/tv` and
`apps/mobile`. Tokens (colors, radii, type ramp, motion curves) are exported
once; both apps consume the same package.

## Design tokens

| Token | Value | Notes |
| --- | --- | --- |
| `colors.bg` | `#06070A` | App background |
| `colors.surface` | `#0E1015` | Card surface |
| `colors.accent` | `#FF3B6E` | Signature pink, used for focused state |
| `colors.violet` | `#8B5CF6` | Secondary accent |
| `radius.tile` | 14 px | Card / poster rounding |
| `radius.cta` | 10 px | Buttons |
| `motion.fast` | 140 ms ease-out | Tile focus scale |
| `motion.page` | 180 ms ease-out | Page transitions |
| `type.display` | 56 / -1.5 / 700 | Hero title |

## Why a shared kit

* The TV and mobile apps look like the same product because they ARE the
  same product — same colors, same motion, same radii.
* When we ship a new shimmer animation, both apps get it on the next bump.
* Storybook-style preview gallery (in `apps/_kit_gallery/`) lets designers
  review tokens before code review.
