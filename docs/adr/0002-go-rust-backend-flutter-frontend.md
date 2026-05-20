# ADR 0002 — Go for backend, Rust for data-plane hotspots, Flutter for TV/mobile

Date: 2025-12-01
Status: accepted

## Context

We are designing a streaming platform that must serve millions of concurrent
sessions with sub-second startup, sub-second channel switching, 14-day rolling
DVR, semantic search and an interface that feels invisible across TV, mobile
and web.

Backend candidates considered: Go, Rust, Java/Kotlin (Spring/Ktor), Node.js,
Python.

Frontend candidates considered: Flutter, native (Swift/Kotlin/AndroidTV),
Kotlin Multiplatform Mobile, React Native, web wrappers (Cordova/Capacitor).

## Decision

### Backend: Go for most services, Rust for data-plane hotspots

Go is our default. Reasons:

* Excellent stdlib + ecosystem for the workloads we have (HTTP, gRPC, Postgres,
  Redis, Kafka, S3). All our infrastructure clients are mature.
* Goroutines + channels map naturally onto our patterns (many small concurrent
  consumers, per-ticket session goroutines, per-channel recorders).
* Static binaries + distroless images → small attack surface, fast deploys,
  predictable resource usage.
* Hireable: large pool of engineers comfortable with the language.

Rust is reserved for the data-plane hotspots where allocator pressure or GC
pauses would show up as user-facing rebuffering:

* the streaming origin router (returns origin URLs per session, must answer in
  single-digit milliseconds at the p99),
* the transcoding orchestrator's I/O hot path (move bytes between ffmpeg
  pipes without copies).

We will not rewrite the playback proxy in Rust unless profiling proves a real
need. Go is fast enough at HMAC + manifest rewriting for the sizes we deal
with.

### Frontend: Flutter for TV + mobile, Next.js for web

Flutter wins because:

* One codebase covers Android TV, Google TV, Fire TV, Apple TV (via tvOS
  embedder), and the eventual Linux desktop / Tizen / WebOS targets.
* It owns its own rendering pipeline so animations look identical across
  hardware — critical for "premium" feel on TVs with very different platforms.
* media_kit (libmpv) gives us H264/H265/AV1 with HW decode on every target.
* Tooling (Riverpod, GoRouter, build_runner) is mature.

Next.js owns web because:

* SSR for the marketing + SEO surface, server actions for catalog rendering.
* Native HLS on Safari, hls.js / shaka-player on Chromium — all well
  supported in browser ecosystems.

## Consequences

* Backend devs need to be comfortable with Go's error idioms and absence of
  generics-heavy patterns. We rely on simple, boring code.
* When a hot path appears to need it, we accept rewriting that service in
  Rust. The proto contracts make this a service-at-a-time decision.
* Frontend hiring shifts away from native iOS/Android toward Flutter.
