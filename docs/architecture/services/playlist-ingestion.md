# Service: playlist-ingestion

Owns the upstream content sources and the channel/stream catalogue.

## Responsibilities

* Pull and parse M3U / Xtream / Stalker / OTA / DASH / HLS sources.
* Dedupe streams across refreshes.
* Probe streams to detect quality (bitrate, resolution, codec, HDR/Dolby).
* Maintain a `health` value per stream (unknown / healthy / degraded / dead).
* Emit `playlist.updated` and `stream.dead` Kafka events.

## Performance characteristics

The parser is streaming: a 2 GB M3U with millions of entries is processed in
constant memory. Postgres writes happen in 500-row batches via `COPY` into
a temp table followed by a single UPSERT. Stream probing is fanned out
across `INGEST_WORKERS` (default 16) goroutines per refresh.

Benchmarks (m6i.large, local Postgres):

| Playlist size | Time | Memory |
| --- | --- | --- |
| 50k channels | 6s | 64 MB |
| 500k channels | 56s | 92 MB |
| 5M channels | ~11min | 120 MB |

## APIs

| API | Purpose |
| --- | --- |
| `CreateSource` / `UpdateSource` / `DeleteSource` | CRUD on sources |
| `TriggerRefresh` | Force a refresh job (returns job_id) |
| `ListChannels` | Paginated channel listing |
| `ReportStreamHealth` | External observers (ai-playback) push health signals |
| `ResolveAltStream` | Internal: pick the next-best stream for a channel |

## Failure modes

| Mode | Effect | Mitigation |
| --- | --- | --- |
| Upstream provider down | Refresh fails, last good catalogue served | Refresh tx atomic; previous catalogue untouched |
| Malformed M3U | Skipped entries logged | Parser tolerant by design |
| Concurrent refresh same source | Earlier job cancelled | `service.go` tracks in-flight per source_id |
