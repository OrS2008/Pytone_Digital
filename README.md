# Nova Stream

> A next-generation streaming platform combining the best of Netflix, Apple TV,
> YouTube TV, Plex, and Formula 1 TV into a single cinematic IPTV + VOD + DVR
> experience.

Nova Stream is a TV-first, AI-augmented streaming ecosystem designed for
millions of concurrent users with sub-second channel switching, 14-day rolling
network DVR, and an interface that feels invisible.

## What makes this different

| Problem in existing IPTV apps | Nova Stream approach |
| --- | --- |
| Slow channel switching (3–10s) | Predictive segment prefetch + warm decoder pool, **<500ms target** |
| Buffering and freezing | AI playback supervisor with multi-source failover |
| Ugly, mouse-first UIs on TVs | Flutter TV app with a deterministic focus engine |
| Broken EPG | XMLTV ingestion + AI metadata enrichment + Redis-backed timeline |
| Fake 4K streams | Active probing during ingestion; bitrate/codec/resolution detected per stream |
| Weak search | Semantic search across Live / VOD / DVR / Sports via Typesense + embeddings |
| No real DVR | Distributed segment recorder with object storage and 14-day rolling retention |
| Poor sync | CRDT-based multi-device sync for watch state, position, favorites |
| Brittle architectures | Go + Rust microservices, Kafka event bus, k8s with multi-region edge |

## Repository layout

```
apps/
  lg-webos/  LG webOS IPK — thin Web App launcher for the hosted /tv route
  tv/        Flutter app for Android TV, Google TV, Apple TV, Fire TV
  mobile/    Flutter app for iOS / Android phones and tablets
  web/       Next.js 15 — public site, /tv route is the HTTP app the IPK loads
  admin/     Next.js admin console for operators

services/
  gateway/              GraphQL + gRPC edge gateway, auth, rate limiting
  auth/                 JWT/OAuth/session service
  user/                 Profiles, preferences, parental controls
  playlist-ingestion/   M3U / Xtream / Stalker / OTA ingestion pipeline
  metadata/             TMDB / TVDB / AI enrichment
  epg/                  XMLTV parsing, EPG timeline, catch-up windows
  search/               Unified semantic search (Typesense + embeddings)
  recommendation/       Collaborative + content-based recs
  playback/             HLS/DASH playlist proxy + token auth + ABR steering
  streaming/            Origin/edge stream router + CDN selection
  transcoding/          FFmpeg orchestration for repackaging / subtitle burn-in
  recording/            Distributed segment recorder
  dvr/                  Catch-up / start-over / replay APIs
  ai-playback/          Stream health monitor + failover decisioning
  analytics/            Event ingestion + QoE telemetry
  notification/         Push notifications (FCM, APNS, web push)
  sports/               Sport-specific overlays, scores, markers
  sync/                 CRDT device sync

libs/
  proto/                Shared protobuf / gRPC contracts
  shared-types/         TypeScript shared types
  player-core/          Flutter shared player abstraction (mpv + ExoPlayer + AVPlayer)
  streaming-core/       HLS/DASH utilities used by both playback proxy and clients
  ui-kit/               Flutter cinematic design system + focus engine
  networking/           Shared HTTP/gRPC client wrappers

infrastructure/
  docker/               Service Dockerfiles + docker-compose for local dev
  kubernetes/           Helm charts and base manifests
  terraform/            AWS + GCP + Cloudflare modules (multi-region)
  monitoring/           Prometheus rules, Grafana dashboards, Loki configs
  cdn/                  CDN routing rules and edge worker scripts

docs/
  architecture/         Service-by-service architecture documents
  adr/                  Architecture Decision Records
  runbooks/             SRE runbooks
  api/                  GraphQL and gRPC API documentation
```

## Quick start (local development)

```bash
# Boot the entire backend (Postgres, Redis, Kafka, Typesense, all services)
make up

# Run the TV app (Flutter)
make tv

# Run the web app (Next.js)
make web
```

See [`docs/architecture/overview.md`](docs/architecture/overview.md) for the full
system design and [`docs/adr/`](docs/adr) for decision records.

## Performance targets

| Metric | Target |
| --- | --- |
| App startup | < 1.0s |
| Channel switch | < 500ms |
| VOD playback start | < 1.0s |
| Catch-up / replay start | < 1.0s |
| Replay seek latency | < 300ms |
| Search latency p95 | < 100ms |
| EPG initial load | < 1.0s |
| UI scroll | 120fps |
| Crash rate | < 0.1% |
| Playback failure rate | < 0.01% |

## License

Proprietary. All rights reserved.
