# Service: playback

Owns playback authorization (tickets) and the live HLS/DASH proxy.

## Responsibilities

* Mint short-lived playback tickets (HMAC + Redis session state).
* Proxy HLS/DASH manifests and segments, rewriting URLs to hide the origin.
* Sample QoE telemetry into Redis pub/sub for the AI supervisor.
* Accept origin hot-swaps from the AI supervisor (TicketService.SwapOrigin).

## Non-responsibilities

* DRM license issuance (lives in [auth] for Widevine/PlayReady proxy
  helpers; license servers themselves are studio-managed).
* Choosing which origin to use first (that's [streaming]).
* Recording (that's [recording]).
* QoE storage (that's [analytics]).

## APIs

| API | Surface | Purpose |
| --- | --- | --- |
| `GetPlaybackTicket` | gRPC, gateway only | Mint a ticket for a (user, content) |
| `ReportQoE` | gRPC streaming | Client-side QoE samples |
| `Heartbeat` | gRPC | Liveness for billable session tracking |
| `/play/{ticketID}/master.m3u8` | HTTP | Public master manifest |
| `/play/{ticketID}/variant.m3u8` | HTTP | Public variant manifest |
| `/play/{ticketID}/seg/...` | HTTP | Public segment proxy |

## Storage

* Redis: `play:ticket:{id}` (TTL = ticket TTL + 30s grace) and
  `play:qoe:{id}` (TTL = 10 min). No durable storage in this service.

## Scaling

* HPA targets: CPU 55%, scale 12 → 240 pods.
* Session affinity at the LB (`ClientIP`, 30-min stickiness) so the same
  client lands on the same proxy pod across master + variant + segments,
  improving Redis cache hits.
* Each pod handles ~2,000 concurrent sessions before backpressure on the
  manifest rewriting path.

## Failure modes

| Mode | Effect | Mitigation |
| --- | --- | --- |
| Origin slow / dead | Rebuffering | AI supervisor swaps origin within seconds |
| Redis unavailable | New tickets fail; in-flight sessions continue | Token TTL was already validated; circuit-break to a Redis Sentinel replica |
| Pod restart | Session continues (LB affinity drops; client retries) | LB session affinity timeout = ticket TTL |
| Token replay | Best-effort blocked at the edge | Token is signed; reuse beyond TTL is rejected |
