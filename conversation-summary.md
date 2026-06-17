# Nova Stream — Session Summary

**Date:** 2026-06-17
**User:** ors2008@gmail.com
**Branch:** `claude/nextgen-iptv-platform-rEZiD`
**Repo:** `ors2008/pytone_digital`

---

## 1. Primary Request and Intent

The user requested a new mockup similar to the M6+ France app — clean, professional, IPTV-suited, not cluttered, user-friendly. The work covered:

- Build a mockup similar to M6+ in design but neutral/calm colors (settled on **"Sage Calm"** palette: `#0F1212` bg, `#9DC2B8` accent)
- Convert mockup to iPhone-style with Dynamic Island, responsive, with pinch-to-zoom
- Build a standalone Android APK via Capacitor pointing at the live web deploy
- Apply M6+ design consistently to ALL pages (not just home) without "bleeding" to the old design
- Add admin panel functionality to manage user packages, downgrade, extend trial
- Fix Pinch-to-Zoom in WebView
- Add a rotate-to-landscape button on the player
- Comprehensive QA across desktop + tablet + phone viewports
- Be creative — add aurora effects, hero phone mockup on landing
- Simplify the home page and account settings as much as possible
- Make sure channels actually play when tapped
- Restore the old (simple) landing page design — drop the creative round
- Don't show /tv/home on desktop — bounce desktop users to /tv

---

## 2. Key Technical Concepts

- **Next.js 14+ App Router** (server components, edge runtime, redirect())
- **Capacitor 6** Android wrapper around WebView pointing at Cloudflare Pages deploy
- **Sage Calm** neutral theme (`#9DC2B8` accent, `#0F1212` bg) vs original apex pink theme
- Pre-paint script in `layout.tsx` that sets `data-theme` before hydration
- `useT()` i18n hook reading from `navigator.language` / localStorage
- M3U playlist parsing — channels have both `id` (internal) and `number` (1-based)
- Cloudflare KV storage for user records with `trialStartedAt` / `subscribedUntil`
- React #418 hydration error (Date.now() drift between SSR + CSR)
- GitHub Actions APK build workflow
- `position: fixed` + `env(safe-area-inset-bottom)` issues on Android OEM WebViews
- `display: block` required on `<a>` for aspect-ratio + min-height to work

---

## 3. Key Files

### `apps/web/src/app/tv/home/page.tsx`
The simplified mobile home page. Most recently added desktop bounce-out:

```tsx
useEffect(() => {
  if (typeof window === 'undefined') return;
  const ua = navigator.userAgent || '';
  const isTv = /webOS|Web0S|SmartTV|Tizen|HbbTV|CrKey|AppleTV/i.test(ua);
  const isPhone = !isTv && /Android|iPhone|iPad|Mobile/i.test(ua) && window.innerWidth <= 820;
  if (!isPhone) router.replace('/tv');
}, [router]);
```

Also fixed tap-to-play bug: changed `c.id` → `c.number` in 3 hrefs.

### `apps/web/src/app/tv/page.tsx`
Legacy TV grid page. Phone redirect (current state):

```tsx
const isPhone = !isTv && /Android|iPhone|iPad|Mobile/i.test(ua) && window.innerWidth <= 820;
if (isPhone) router.replace('/tv/home');
```

### `apps/web/src/app/page.tsx` (root)
Signed-in → `/tv` (NOT `/tv/home`):

```tsx
if (session?.value) redirect('/tv');
```

### `apps/web/src/app/welcome/WelcomeLanding.tsx` + `welcome.css`
Restored to pre-creative-round version. Simple layout: hero, 4 emoji feature cards, How it works, footer. Kept sage palette swap.

### `apps/web/src/app/tv/live/page.tsx`
Lookup logic at line 268:
```tsx
const idx = result.channels.findIndex((c) => String(c.number) === want);
```
This is what required the home page href fix.

### `apps/web/src/app/tv/themes.css`
Added `sage` theme with neutral palette:
```css
--ns-accent: #9DC2B8;
--ns-bg: #0F1212;
```

### `apps/web/src/components/tv/TvBoot.tsx`
Mirror of pre-paint logic — pick sage when not a TV.

### `apps/web/src/app/tv/account/Shell.tsx`
9 SVG icons replacing unicode dingbats (◉ ◆ ✦ ▣ ⛁ ▶ ◐ ◑ ?). Simplified to 6 nav items in one column (was 9 across 3 groups): Overview, Subscription, Playlists & EPG, Devices, Appearance, Help & legal.

### `apps/web/src/components/tv/AccountChip.tsx`
Localized via useT(): `chip.menu`, `chip.trialNDays`, etc.

### `apps/web/src/components/tv/MobileTabBar.tsx` + `.css`
Bottom nav for phones, fixed bottom position 0.85rem. Hides on width > 819px.

### `apps/web/src/app/api/admin/users/[email]/access/route.ts` (NEW)
PATCH endpoint with 4 actions: extendTrial, resetTrial, grantSubscription, cancelSubscription.

### `apps/web/src/app/admin/dashboard/page.tsx`
Added `ManageAccessModal` opened via new "Manage" button per user row.

### `apps/web/src/lib/locales/en.ts` + `he.ts`
Added ~50 keys: `home.*`, `gate.*`, `ac.*`, `chip.*`, `guide.*`, `catchup.*`, `search.*`.

### `apps/web/src/app/tv/catchup/page.tsx`
Fixed React #418: changed `useMemo(() => new Date(), [])` to `useState<Date|null>(null)` + setToday in useEffect.

### `apps/android/capacitor.config.ts`
- `server.url = "https://nova-stream-cce.pages.dev/tv"`
- Sage brand colors

### `apps/android/android-overrides/app/src/main/java/tv/novastream/app/MainActivity.java`
- Added `setSupportZoom(true)` + `setBuiltInZoomControls(true)` + `setDisplayZoomControls(false)` for pinch-to-zoom
- Sage status/nav bar colors

### `apps/web/src/components/tv/live/PlayerSurface.tsx`
Added `toggleLandscape()` button using Screen Orientation API.

---

## 4. Errors and Fixes

| Issue | Root Cause | Fix |
|-------|------------|-----|
| **React #418 on /tv/catchup** | `useMemo(() => new Date(), [])` produced different SSR vs hydration timestamps | `useState<Date\|null>(null)` initialized in useEffect + null-guard `fmtDayLong`/`fmtDayShort` |
| **Apex pink leaked through despite theme=sage** | Pre-paint script in layout.tsx didn't include 'sage' or auto-pick it | Updated THEME_BOOT to recognize 'sage' and auto-pick on phones (then expanded to all non-TVs) |
| **Hero aspect-ratio collapsed to 0** | `<Link>` is inline by default; aspect-ratio doesn't work on inline elements | Added `display: block` to `.nshome-hero` (and live-card, genre-tile) |
| **Tab bar floated in middle of screen** | `bottom: calc(0.85rem + env(safe-area-inset-bottom))` — Android OEMs report huge values | Used `bottom: 0.85rem` plain; absorbed inset as inner padding |
| **Account sidebar broken dingbats** (◉ ◆ ✦ ▣ ⛁ ▶ ◐ ◑ ?) | Unicode chars not rendering | Replaced with 9 proper SVG icons in Shell.tsx |
| **Channels didn't play on tap** | Home page used `?ch=${c.id}` but /tv/live page does `findIndex((c) => String(c.number) === want)` | Changed `c.id` → `c.number` in 3 places (Rail items, hero, Continue Watching) |
| **/tv/home shown on desktop** | No device gating | Added redirect for non-phones to `/tv` |
| **Welcome creative pass too noisy** | Aurora + phone mockup felt over-designed | Reverted WelcomeLanding.tsx + welcome.css to pre-`beec096` version |

---

## 5. Sage Palette

```css
--ns-bg: #0F1212;
--ns-accent: #9DC2B8;
--ns-accent-light: #BFDCD3;
--ns-text: #E7ECF3;
--ns-muted: #99A3B5;
```

Welcome page uses richer background:
```css
background:
  radial-gradient(ellipse 1200px 600px at 20% -10%, rgba(157,194,184,0.18), transparent 60%),
  radial-gradient(ellipse 900px 500px  at 80%  20%, rgba(191,220,211,0.10), transparent 65%),
  #04060B;
```

---

## 6. Routing Sympathy

| URL | Phone | Desktop |
|-----|-------|---------|
| `/` (signed out) | WelcomeLanding | WelcomeLanding |
| `/` (signed in) | → `/tv` → `/tv/home` | → `/tv` (stay) |
| `/tv` | → `/tv/home` | Legacy grid (stay) |
| `/tv/home` | Mobile home (stay) | → `/tv` |

`/tv` and `/tv/home` are aliases for the right device class instead of competing layouts.

---

## 7. Security / Process Constraints

- **Branch:** `claude/nextgen-iptv-platform-rEZiD` — all work happens here
- Never push to a different branch without explicit permission
- Do NOT create a PR unless explicitly asked
- GitHub MCP tools restricted to `ors2008/pytone_digital`
- `FIREBASE_API_KEY` (public Web SDK key) safe in `wrangler.toml [vars]`
- `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` → **Cloudflare Secrets only**, never wrangler.toml
- `PUBLIC_BASE_URL = "https://nova-stream-cce.pages.dev"` pinned in wrangler.toml
- Sandbox cannot download GitHub Actions artifacts (Azure blob URLs blocked)

---

## 8. Latest Commits

- `67a9143` — restore old welcome landing + fix tap-to-play
- `42b5b1e` — home: bounce desktop visitors off /tv/home to /tv

---

## 9. Final State

- **Phones:** see the simplified `/tv/home` with sage theme, working tap-to-play, fixed tab bar, localized i18n
- **Desktop / laptops:** always land on legacy `/tv` grid; cannot get stuck on the mobile-only layout
- **TVs (webOS/Tizen/AppleTV):** stay on `/tv` legacy grid
- **Welcome page:** simple pre-creative-round design with sage palette
- **Admin panel:** can extend trial, reset trial, grant subscription, cancel subscription per user
- **Android APK:** Capacitor wrapper with pinch-to-zoom + sage system bars
