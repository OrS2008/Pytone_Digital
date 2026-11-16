# IPTV Feature Implementation Report

**Date:** 16 November 2026 · Status labels: see `KNOWN_LIMITATIONS_AND_BLOCKERS.md`.
"PASS (sim)" = implemented and verified by automated tests against simulated providers/streams; real-provider verification is blocked (B3).

| Feature | Status | Where | Tests |
|---|---|---|---|
| Provider setup (Xtream, Stalker) in Sources | PASS (sim) | `components/tv/ProviderForm.tsx`, `tv/account/sources` | browser: connect, rejection, no password in browser |
| Active source selection, multiple sources | PASS (sim) | Sources "Use this playlist", `channelCache.getUserSourceUrl` | browser |
| Live TV from providers | PASS (sim) | `/api/providers/:id/live` → existing channel list and player | integration + browser (plays) |
| Live TV: categories, logos, numbers, favourites, history, search, fast switching | PASS (sim) — existing | `tv/live`, `tv/search` | browser suite |
| Movies catalogue (search, categories, sort, posters, ratings, years) | PASS (sim) | `tv/movies`, `components/tv/vod/Catalog.tsx` | browser (phone + desktop) |
| Movie details (plot, genre, duration, cast, director, backdrop) | PASS (sim) | `MovieSheet` | browser |
| Series catalogue, seasons, episodes | PASS (sim) | `tv/series`, `tv/series/view` | browser |
| VOD / episode playback | PASS (sim) | `tv/watch` (native controls, hls.js) | browser (plays) |
| Audio / subtitle track selection | PARTIAL | `tv/watch` pickers (hls.js streams); native tracks via browser controls | NOT TESTED (no multi-track fixture) |
| Continue watching / resume (synced) | PASS (sim) | `lib/vodProgress.ts` (synced key `vod.progress`) | browser (saved) |
| Auto-next episode | PARTIAL | `tv/watch` countdown | NOT TESTED end-to-end |
| Catch-up for Xtream channels | PARTIAL | channel `catchupSource` → play route timeshift | integration (URL built, 302) |
| EPG from Xtream (`xmltv.php`) | PARTIAL | `/api/providers/:id/epg`, `epgCache` | integration |
| Capability-gated navigation (no dead links) | PASS (sim) | `TvNav`, home tiles | browser |
| Honest empty / error states | PASS (sim) | `NoProvider`, watch error card, player sign-in prompt | browser |
| Sign-in / trial-ended prompts in player | PASS (sim) | `PlayerSurface` (401/402) | integration (API) |
| Hebrew / RTL for new screens | PASS (sim) | locale keys `prov.*`, `vod.*`, `live.*` | browser (he run of screen suite) |
| Large libraries | PARTIAL | Catalog pages of 60 + lazy images; live list `content-visibility` | perf measurement |
| Raw MPEG-TS live playback (mpegts.js, incl. TS-only Xtream panels) | PARTIAL | `PlayerSurface` (`isRawTsUrl` → mpegts.js), Xtream `preferredLiveExt` | browser (phone + desktop, decoded frames); not on iPhone (no MSE) |
| Unified search (live + movies + series) | PASS (sim) | `tv/search` | browser |
| VOD favourites ("My list") | PASS (sim) | `lib/vodFavorites`, `vod/FavButton` | browser |
| EPG reminders (in-app toast; notification when backgrounded) | PASS (sim) | `lib/reminders`, `ReminderWatcher`, guide cells | browser (phone + desktop) |
| Search history | PASS (sim) | `lib/searchHistory`, `tv/search` | browser |
| Custom channel groups + rail filter | PASS (sim) | `lib/channelGroups`, `/tv/account/groups`, `ChannelRail` | browser |
| Parental profiles | NOT DONE | single household block list + PIN | |

## Data model changes
- Browser source entries may now be `{ kind: 'XC' | 'MAG', sub: 'provider:<id>' }`; guide entries `sub: 'provider:<id>'`.
- New synced keys `epg.reminders`, `search.history`, `channels.groups`; `favorites` (live channels) now synced too.
- New synced key `vod.progress` (map of `provider:kind:id` → position, duration, title, poster, series context; max 60, finished titles removed).
- `ns.providerCaps` (local only) caches capabilities for synchronous nav rendering.

## Files added
`src/lib/providers/{types,util,xtream,stalker,index,store,http}.ts`, `src/lib/providersClient.ts`, `src/lib/vodProgress.ts`, `src/app/api/providers/**`, `src/app/tv/{movies,series,series/view,watch}/page.tsx`, `src/components/tv/ProviderForm.tsx`, `src/components/tv/vod/{Catalog,NoProvider}.tsx`, `vod.css`.

## Defects found by the new tests and fixed
1. Watch page re-fetched the stream on every render (unstable `t` in an effect dependency).
2. Provider config accepted `ftp://x` as host "ftp".
3. The Content Security Policy blocked `blob:` workers: mpegts.js could never start and hls.js silently transmuxed on the main thread. Fixed with `worker-src 'self' blob:`.
