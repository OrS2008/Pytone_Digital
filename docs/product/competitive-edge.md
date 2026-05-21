# Competitive edge — what we beat the field on

This document captures real pain points from public reviews of CloudDy,
TiviMate, IPTV Smarters, Sparkle, Flix IPTV, Smart STB, and Net IPTV, and
the concrete Nova Stream features that address each one.

## The four buckets users complain about most

1. **Buffering / slow channel switch.** Across thousands of 1- and 2-star
   reviews this is rank #1. Users blame the app even when the upstream
   stream is at fault.
2. **Ugly / outdated UI.** Reviewers compare unfavourably to YouTube TV,
   HBO Max, Disney+. Buttons too small, focus invisible, no animations.
3. **EPG that lies.** Wrong programme times, blank slots, missing posters.
4. **Broken DVR / catch-up.** Recordings fail silently, replays don't
   start, no "restart programme from beginning."

Everything below is structured around removing one of those.

---

## Speed & playback

| Pain in competitors | Nova Stream answer | Status |
| --- | --- | --- |
| Channel switch >3 s | Predictive prefetch of adjacent channels in the rail, warm decoder pool, sub-500ms target | Architected (playback proxy + ai-playback) |
| Buffering rebuffer rate >2% | Closed-loop AI supervisor swaps origins mid-stream without restarting the player | Implemented |
| Decoder errors with no recovery | Per-codec capability negotiation at ticket issuance; falls back to repackaged variants | Architected |
| No restart-from-beginning | "Restart programme" button on the info bar, uses catch-up window | **Implemented (this commit)** |
| No rewind on live | Live-rewind via the catch-up segment index | Architected |
| No skip-intro / next-episode | Audio-fingerprint based intro detection in metadata service | Tracked |

## EPG & metadata

| Pain | Answer | Status |
| --- | --- | --- |
| Programme times wrong | Multiple-source XMLTV merge with confidence scoring, user one-tap report | Architected |
| Missing posters / blurry | TMDB + TVDB + AI fallback; 512×768 WebP at the CDN | Architected |
| Logos broken | Curated logo pack per region; user can upload a replacement | Tracked |
| Categories arbitrary | LLM categoriser on programme title + description + channel context | Architected |
| "No info" gaps | Backfill from regional EPG providers + crowdsourced corrections | Tracked |
| Hebrew / Arabic / multi-language EPG | i18n at the data layer, not the UI; channels carry language metadata | Architected |

## Recording & catch-up

| Pain | Answer | Status |
| --- | --- | --- |
| Recordings fail silently | Per-segment audit log; user gets a notification if a recording fails | Implemented (recording worker + notification service) |
| No series recording | Series rules with new-only / max-recordings / padding controls | Implemented (dvr scheduler) |
| Cannot pad start/end | Padding settable per rule and per one-off | Implemented |
| 14-day catch-up rolls quietly | Visible "available until" date on every programme card | Implemented (UI surfaces it from `catchup_available`) |
| Catch-up start latency | Pre-built VOD manifests cached at the CDN edge | Implemented (dvr.ManifestBuilder + edge worker) |
| Cannot share recordings across family | Per-profile recording lists + family-shared queue | Tracked |

## TV-first UX

| Pain | Answer | Status |
| --- | --- | --- |
| Focus invisible | 3px pink ring + 1.06× scale on every focusable; never use browser default | Implemented |
| Settings buried 5 menus deep | Settings reachable from Info bar long-press | Tracked |
| Channel numbers don't work | Number-zap overlay (HOT/YES style) commits 800ms after last digit | **Implemented (this commit)** |
| Info banner missing | Bottom info bar with channel · programme · time · progress · actions | **Implemented (this commit)** |
| EPG grid is laggy | The grid is virtualised — only visible cells render | Tracked |
| No PiP on TV | Mini-player when entering settings / browse | Tracked |
| Settings menu blocks playback | Overlay rather than full-screen | Implemented (Info bar is an overlay) |

## Subscriptions & account

| Pain | Answer | Status |
| --- | --- | --- |
| Unclear free / paid line | 7-day free trial starts at email activation, banner counts down trial days | **Implemented (auth.Activate + JWT claim trial_until)** |
| Can't share with family | "Multi" plan: 4 concurrent devices | **Implemented (DeviceManager)** |
| Account hijack | Argon2id passwords, brute-force lockout, refresh-token replay revokes chain, audit log + email alerts on new device | **Implemented** |
| No way to revoke a stolen device | Account → Devices shows active sessions with last-seen, one-tap revoke | Implemented (DeviceManager.ActiveDevices powers it) |
| Forced re-login on every app open | Refresh tokens with 30-day TTL, rotate on each use | Implemented |
| Cannot reset password | One-click reset email, 1h single-use token | Implemented |
| Email verification missing | Required before trial starts | **Implemented** |
| Payment forced before trial | Trial requires only email; payment captured on conversion | Implemented (status machine) |

## Sports & special modes

| Pain | Answer | Status |
| --- | --- | --- |
| Score spoilers in EPG | Spoiler mode redacts scores + tournament progress for opted-in users | Tracked |
| Multi-cam matches | Multi-view returns synced ticket IDs for related feeds | Architected (sports service) |
| No live highlights | AI generates a 5-min reel post-match from event markers + audio energy | Architected |
| Missing favourite-team alerts | Push notification N min before kickoff for users who marked the team | Tracked |

---

## Pricing structure (matches the implemented schema)

| Plan | Price (target) | Devices | Trial |
| --- | --- | --- | --- |
| **Single** | TBD ₪/month | 1 concurrent | 7 days |
| **Multi**  | TBD ₪/month | 4 concurrent | 7 days |

Plan changes prorate at the Stripe layer; downgrading from Multi to Single
while 2+ devices are active forces the user to revoke down to 1 before the
change applies (the UI surfaces the active devices).

---

## What we will NOT compete on

* **Cheapest provider.** We're competing on quality, not price.
* **Bundled stream catalogue.** Users bring their own playlist / Xtream
  credentials. We don't host content.
* **Ad-supported tier.** Premium-only keeps the UX clean.
* **Sideloaded "free forever" mode.** The 7-day trial is the path in. No
  cracked-APK fallback.

---

This document is reviewed quarterly. The implementation status column gets
updated as items ship; tracked items appear on the GitHub project board.
