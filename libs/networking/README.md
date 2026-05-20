# libs/networking

Shared HTTP / gRPC client wrappers used by multiple services to talk to each
other. Centralising this here means we get consistent:

* timeouts (`5s` per call, `30s` for streaming)
* retries (3 attempts with jittered exponential backoff; idempotent calls only)
* circuit breakers (per-target, sliding window)
* OpenTelemetry propagation (W3C TraceContext + Baggage)
* mTLS in production (Cilium / SPIFFE-issued certs)
* compression (gRPC compressor `gzip` on the wire)
