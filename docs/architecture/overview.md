# Architecture Overview

Pytone Digital is a microservices-based streaming platform. Each service owns its
data, exposes typed gRPC APIs internally, and is reachable from clients only
through the GraphQL/REST gateway.

## Topology

```
                       ┌────────────────────────────────────────────┐
                       │                Edge layer                  │
                       │  Cloudflare + multi-region origin shields  │
                       └──────────────────┬─────────────────────────┘
                                          │
                ┌─────────────────────────┼─────────────────────────┐
                │                         │                         │
        ┌───────▼────────┐       ┌────────▼────────┐       ┌────────▼────────┐
        │  TV / Mobile   │       │  Playback proxy │       │   Web / Admin    │
        │  (Flutter)     │       │  (HLS/DASH)     │       │   (Next.js)      │
        └───────┬────────┘       └────────┬────────┘       └────────┬────────┘
                │                         │                         │
                └────────────┬────────────┴─────────────┬───────────┘
                             │                          │
                     ┌───────▼────────┐         ┌───────▼────────┐
                     │   GraphQL      │         │  gRPC clients  │
                     │   Gateway      │         │  (internal)    │
                     └───────┬────────┘         └───────┬────────┘
                             │                          │
   ┌────────┬────────┬───────┴─────────┬────────┬──────┴────┬──────────┐
   │        │        │                 │        │           │          │
   ▼        ▼        ▼                 ▼        ▼           ▼          ▼
┌─────┐ ┌─────┐ ┌────────┐  ┌─────────────────┐ ┌────────┐ ┌──────┐ ┌─────┐
│auth │ │user │ │ search │  │ playlist-ingest │ │  epg   │ │ dvr  │ │ ... │
└─────┘ └─────┘ └────────┘  └────────┬────────┘ └────────┘ └──────┘ └─────┘
                                     │
                              ┌──────┴──────┐
                              │   Kafka     │  (events: playlist.refresh,
                              │             │   stream.dead, dvr.recording,
                              │             │   playback.qoe, ...)
                              └──────┬──────┘
                                     │
                ┌────────────────────┼────────────────────┐
                ▼                    ▼                    ▼
        ┌──────────────┐    ┌────────────────┐  ┌───────────────┐
        │  metadata    │    │  ai-playback   │  │  recording    │
        │  enrichment  │    │  supervisor    │  │  workers      │
        └──────┬───────┘    └────────┬───────┘  └──────┬────────┘
               │                     │                 │
               └─────────────────────┴────────┬────────┘
                                              │
                                     ┌────────▼────────┐
                                     │ Object storage  │  (S3 / MinIO /
                                     │  + Postgres +   │   Wasabi)
                                     │  Redis cluster  │
                                     └─────────────────┘
```

## Data plane vs control plane

* **Control plane** — gateway, auth, user, search, recommendation, metadata, EPG,
  DVR catalog, sync. All gRPC. PostgreSQL primary, Redis for hot reads.
* **Data plane** — playback proxy, streaming router, recording workers, transcoding.
  These services move bytes; they must be horizontally scalable and stateless.

## Event-driven backbone

Kafka topics:

| Topic | Producers | Consumers | Purpose |
| --- | --- | --- | --- |
| `playlist.refresh` | playlist-ingestion scheduler | playlist-ingestion workers | Trigger pull of a playlist source |
| `playlist.updated` | playlist-ingestion | metadata, epg, search | Channel list changed |
| `stream.health` | ai-playback, playback | playlist-ingestion, analytics | Stream health observations |
| `stream.dead` | ai-playback | playlist-ingestion | Mark a stream as broken |
| `epg.updated` | epg | recording, search, recommendation | EPG refresh notification |
| `dvr.recording.started` | recording | dvr | New recording started |
| `dvr.recording.completed` | recording | dvr, search | Recording finished and indexed |
| `playback.qoe` | playback (via clients) | analytics, ai-playback | QoE telemetry |
| `user.activity` | gateway | recommendation, sync | Watch progress, favorites |

## Storage strategy

| Service | Primary store | Cache | Notes |
| --- | --- | --- | --- |
| auth, user | Postgres | Redis | Multi-tenant accounts |
| playlist-ingestion | Postgres | Redis | Sources, channels, streams |
| epg | Postgres (partitioned by day) | Redis sorted sets | Timeline lookups in O(log n) |
| metadata | Postgres + S3 (images) | Redis | TMDB/TVDB cache |
| search | Typesense / Meilisearch | — | Embeddings stored as float vectors |
| recommendation | Postgres + Redis | — | Hybrid CF + content embeddings |
| recording | Object storage (S3/MinIO) | — | Segment-level addressing |
| dvr | Postgres (catalog) | Redis | Points at recording manifest |
| analytics | ClickHouse | — | QoE rollups |
| sync | Postgres | Redis | CRDT documents per user |

## Ingestion pipeline

```
M3U / Xtream / Stalker / OTA / DASH / HLS
                │
                ▼
   ┌──────────────────────────────┐
   │  ingestion-scheduler         │  cron + Kafka producer
   └──────────────┬───────────────┘
                  │ playlist.refresh
                  ▼
   ┌──────────────────────────────┐
   │  ingestion-workers           │  streaming M3U parser
   └──────────────┬───────────────┘
                  │
                  ▼
   ┌──────────────────────────────┐
   │  stream-validator            │  HEAD + manifest probe, codec detect
   └──────────────┬───────────────┘
                  │ playlist.updated
                  ▼
   ┌──────────────────────────────┐
   │  metadata-enricher           │  TMDB / TVDB / AI categorization
   └──────────────┬───────────────┘
                  │
                  ▼
   ┌──────────────────────────────┐
   │  epg-matcher                 │  fuzzy match channel ↔ XMLTV ID
   └──────────────┬───────────────┘
                  │
                  ▼
   ┌──────────────────────────────┐
   │  search-indexer              │  push to Typesense
   └──────────────────────────────┘
```

The parser is **streaming** — it never loads the whole playlist into memory, so a
multi-gigabyte M3U with millions of entries is processed in constant memory.

## Playback pipeline

1. Client requests a playback URL via the gateway.
2. Gateway calls `playback.GetPlaybackTicket(channel_id|stream_id)`.
3. Playback service mints a short-lived token (HMAC, 5-minute TTL) and returns a
   URL pointing at the playback proxy.
4. Client opens the proxied HLS/DASH manifest.
5. Proxy validates the token, rewrites segment URLs to also embed tokens,
   forwards to the chosen origin, and tees QoE samples to Kafka.
6. ai-playback consumes QoE samples; if it detects sustained rebuffering or
   bitrate drop, it publishes `stream.degraded` and instructs the proxy to fail
   over to an alternate origin without breaking the client session.

## DVR architecture

* **Recording workers** subscribe to channels marked "recordable". For each
  channel they pull HLS segments continuously and write them to object storage
  using a content-addressable layout: `dvr/{channel_id}/{date}/{hour}/{seq}.ts`.
* **Manifest builder** assembles VOD-style HLS manifests on demand for any
  window in the last 14 days.
* **Retention sweeper** runs hourly, deleting segments older than the channel's
  configured retention.
* **DVR catalog** in Postgres tracks programmes ↔ segment ranges so a user
  asking for "last night's match" gets a manifest spanning exactly the
  programme's segments.

See per-service docs in [`docs/architecture/services/`](./services/).
