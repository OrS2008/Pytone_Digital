# HaPina HaLevana — הפינה הלבנה · The White Corner

> The legendary shawarma experience of Yehud — a premium, cinematic digital
> experience built to make visitors hungry within seconds and turn them into
> customers.

A production-grade marketing + ordering site for a decades-old Israeli
shawarma restaurant, designed to feel like a world-class culinary brand
(Apple / Michelin / luxury-hotel calibre) rather than a fast-food template.

---

## Tech stack

| Layer        | Choice |
| ------------ | ------ |
| Framework    | **Next.js 15** (App Router, RSC, Turbopack build) |
| Language     | **TypeScript** (strict) |
| Styling      | **Tailwind CSS v4** with a custom brand `@theme` |
| Animation    | **Framer Motion** (scroll reveals, parallax, embers, accordions) |
| Icons        | **Lucide** |
| Forms        | **React Hook Form + Zod** (client + server validation) |
| Images/OG    | `next/og` (runtime-generated icons + Open Graph card) |
| Deploy       | **Vercel** (zero-config) |

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run start      # serve the production build
npm run typecheck  # strict TS, no emit
```

## Project structure

```
src/
  app/
    layout.tsx            Root: fonts, metadata, JSON-LD, nav/footer/sticky bar
    page.tsx              Home — cinematic single-page journey
    story/                Brand story + timeline (past → present → future)
    menu/                 Interactive menu page
    gallery/              Masonry luxury gallery
    location/             Hours, map, directions, amenities, FAQ
    contact/              Contact channels + validated form
    api/contact/          Rate-limited, honeypot-protected form endpoint
    icon.tsx              Favicon (PNG via next/og)
    apple-icon.tsx        Apple touch icon
    icons/[size]/         PWA manifest icons (192 / 512 / maskable)
    opengraph-image.tsx   Social share card
    manifest.ts           PWA manifest
    sitemap.ts / robots.ts
  components/             Nav, Footer, Hero, MenuExplorer, Gallery, Reviews…
  content/                Typed, CMS-ready content (restaurant, menu, reviews…)
  lib/                    utils (hours, WhatsApp links, plate art), schema, icon
```

## Content is the CMS layer

All copy, menu items, prices, reviews, hours and NAP data live in typed modules
under `src/content/`. Every component reads from these — nothing is hard-coded
in the UI. To connect **Sanity or Contentful**, replace each module with an
async fetch that returns the same shape; no component changes required.

`src/content/restaurant.ts` is the single source of truth for name, address,
phone, geo, hours and social links (used by the UI **and** the Schema.org
markup, so SEO can never drift from the site).

## Brand system

See [`BRAND.md`](./BRAND.md). Colors and typography are encoded as Tailwind v4
theme tokens in `src/app/globals.css` (`--color-gold`, `--color-ember`,
`--font-display`, …), so the whole site restyles from one place.

## What's wired vs. what needs assets/keys

Fully working now:

- Cinematic animated home, story, interactive menu (search + diet filters),
  gallery, reviews, location with live open/closed status (Israel time),
  contact form with server validation, FAQ.
- WhatsApp deep-link ordering (pre-fills the cart), Waze + Google Maps
  directions, tap-to-call.
- SEO: Schema.org `Restaurant` + `AggregateRating` + `Menu`, Open Graph &
  Twitter cards, sitemap, robots, canonicals, per-page metadata.
- PWA: installable manifest, generated icons, theme color, app shortcuts.
- Security headers (CSP-ready, HSTS, nosniff, frame options), API rate limiting,
  honeypot spam protection.
- Accessibility: skip link, focus-visible rings, semantic landmarks, ARIA on
  interactive widgets, `prefers-reduced-motion` throughout.

Production integration points (marked `PRODUCTION:` / `TODO(production):` in
code):

- **Hero video** — drop `public/hero.mp4` (+ poster) and uncomment the `<video>`
  in `components/home/Hero.tsx`. An animated ember/fire scene renders until then.
- **Food photography** — every dish/gallery tile renders a deterministic
  cinematic "plate" from its hue. Replace `PlateArt` with `next/image` using the
  same aspect box to drop in real magazine photography.
- **Ordering / payments** — WhatsApp ordering works today; wire a provider
  (Wolt / 10bis / Tabit) or Stripe (Apple Pay / Google Pay) at `restaurant.links.orderOnline`.
- **Contact delivery** — `api/contact` validates and rate-limits; add your
  email (Resend/SendGrid) or WhatsApp Business webhook and a CAPTCHA token check.
- **Analytics** — add GA4 / GTM / Meta Pixel / Clarity via `next/script` in the
  root layout.
- **Live map** — the `.map-slot` in `components/LocationBlock.tsx` is sized for a
  Google Maps Embed or Mapbox GL map.

## Deployment

Zero-config on **Vercel**: import the repo, set the root to `hapina-halevana/`,
deploy. AVIF/WebP, SSG/SSR, code-splitting and CDN caching are on by default.
