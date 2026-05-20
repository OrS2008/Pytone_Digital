package playback

import (
	"context"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// ABRSteering aggregates per-session and per-stream health signals and feeds
// the AI playback service. It is the "ear" of the system: the AI is the
// "brain" that decides whether to swap origins.
//
// Per session we keep a small ring buffer in Redis: the timing of the last 32
// segment fetches and the running rebuffer count. AI playback subscribes to
// this stream via Redis keyspace notifications (or a Kafka topic in
// production) and emits failover decisions back via TicketService.SwapOrigin.
type ABRSteering struct {
	rdb *redis.Client
}

// NewABRSteering wires a steering instance.
func NewABRSteering(rdb *redis.Client) *ABRSteering {
	return &ABRSteering{rdb: rdb}
}

// ObserveSample is one telemetry data point.
type ObserveSample struct {
	Kind  string // "manifest" or "segment"
	Bytes int
	// Optional fields populated when client posts QoE explicitly:
	BufferMs       int
	RebufferCount  int
	BitrateKbps    int
	DroppedFrames  int
}

// Observe records the sample in Redis. Operations are O(1).
func (a *ABRSteering) Observe(ctx context.Context, tk Ticket, s ObserveSample) {
	key := "play:qoe:" + tk.ID
	now := time.Now().UnixMilli()
	pipe := a.rdb.Pipeline()
	pipe.HIncrBy(ctx, key, "samples", 1)
	pipe.HIncrBy(ctx, key, "bytes", int64(s.Bytes))
	pipe.HSet(ctx, key, "last_at", now)
	if s.RebufferCount > 0 {
		pipe.HIncrBy(ctx, key, "rebuffers", int64(s.RebufferCount))
	}
	if s.BitrateKbps > 0 {
		pipe.HSet(ctx, key, "bitrate_kbps", strconv.Itoa(s.BitrateKbps))
	}
	pipe.Expire(ctx, key, 10*time.Minute)
	// Publish a heartbeat into a pub/sub channel the AI playback service
	// subscribes to. The actual decision is made out-of-band so the proxy hot
	// path stays cheap.
	pipe.Publish(ctx, "play:qoe", tk.ID)
	_, _ = pipe.Exec(ctx)
}
