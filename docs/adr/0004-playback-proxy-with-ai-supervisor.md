# ADR 0004 — Playback proxy with closed-loop AI supervisor

Date: 2025-12-01
Status: accepted

## Context

Two of the loudest complaints about existing IPTV apps are (a) buffering and
freezing and (b) opaque, hard-to-recover stream failures. We must do better
than the standard "client picks an origin and hopes for the best" pattern.

## Decision

All playback flows through a server-side proxy that:

1. Issues short-lived HMAC-signed tickets so origin URLs are never exposed
   to clients.
2. Rewrites HLS/DASH manifests on the fly so segment requests flow back
   through us. The client only ever sees `https://play.novastream.tv/play/...`.
3. Samples QoE telemetry per session (sampling rate: every manifest, 1% of
   segments) into Redis.
4. Allows hot-swapping the upstream origin associated with a ticket without
   the client tearing down its session.

A separate **AI playback supervisor** subscribes to QoE notifications and
runs a closed-loop control system:

* For each session it scores (rebuffer rate, bitrate deficit) → failure
  probability.
* When the score crosses a threshold it asks playlist-ingestion for the best
  alternate stream on the same channel and tells the proxy to swap the
  ticket's origin.
* It also aggregates per-stream signals across sessions: a stream that
  causes failovers across many viewers gets globally demoted, protecting
  future sessions before they hit the broken origin.

## Consequences

* Mean time to recover from a bad origin is bounded by the QoE sample
  cadence + supervisor reaction time — single seconds, not minutes.
* The proxy is the chokepoint for traffic. It must scale aggressively
  (k8s HPA from 12 to 240 pods is wired in) and stay cheap per request.
* We accept that we will not always pick the right alternate stream. The
  threshold is conservative; false failovers cost the user a single segment
  refetch.
* DRM playback is opaque to the proxy by design; for DRM-protected content
  the proxy degrades to a thin authenticator and lets the client talk
  directly to the license server.
