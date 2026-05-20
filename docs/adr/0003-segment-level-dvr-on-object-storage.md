# ADR 0003 — Segment-level network DVR on object storage

Date: 2025-12-01
Status: accepted

## Context

We need 14-day rolling network DVR for every recordable channel, accessible
from any device, with replay startup under 1 second and replay seeks under
300 ms.

Architectural options:

1. Per-recording container files (ts/mp4) on EBS / local disk.
2. Segment-level recording into object storage (S3-compatible), VOD-style
   manifest built on demand.
3. Continuous origin-side recording at the CDN with HTTP range serving.

## Decision

We choose **option 2**.

The recording worker pulls live HLS segments verbatim and writes them to
object storage with a deterministic, content-addressable key. A Postgres
index row per segment tracks (channel, started_at, duration_ms, object_key).

On replay, the DVR service queries the index for the requested time window
and produces a `#EXT-X-PLAYLIST-TYPE:VOD` manifest pointing at signed
segment URLs. The CDN edge caches segments for their natural duration. No
re-encoding ever happens.

## Consequences

### Wins

* **Zero CPU cost.** No transcoding; we just copy bytes.
* **No quality loss.** Subscribers see the same bitrate as live.
* **Cheap storage.** S3 Intelligent-Tiering / R2 absorb cold segments. ~10x
  cheaper than EBS.
* **Constant-time seek.** Each segment is independently addressable; the
  player seeks by jumping segments.
* **Crash safe.** A killed worker doesn't lose anything — the next worker
  picks up the channel from the next live segment. Existing segments are
  immutable.
* **Cheap replay.** Building a manifest is a single SQL range scan +
  signing — O(window/segment_duration) ≈ tens to hundreds of rows.

### Tradeoffs

* The source must already be HLS or DASH. For MPEG-TS / progressive sources
  the transcoding service repackages live (TS → fMP4) once, then the
  recorder consumes the repackaged HLS.
* Segment-aligned cuts mean a recording's actual start/stop is ±half a
  segment from the programme start/stop. We compensate with configurable
  padding.
* If a source rotates segment URIs (some providers do this for anti-leeching)
  we cannot de-dupe across rotations and may store duplicate bytes for a
  refresh-interval window. Acceptable; very few sources do this.
