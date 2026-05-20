// Package supervisor implements the AI playback supervisor.
//
// "AI" here is not a marketing label for a neural network — it is a
// closed-loop control system that consumes QoE signals and emits failover
// decisions. Concretely:
//
//   - We subscribe to the `play:qoe` Redis pub/sub channel. Each notification
//     names a ticket whose state changed.
//   - For each notified ticket we read its rolling window (bitrate samples,
//     rebuffer count, byte rates).
//   - We score the session against a learned threshold model. If the score
//     crosses, we ask the playlist service for the best alternative stream on
//     the same channel, then call playback.SwapOrigin to fail the session
//     over without restarting the player.
//   - We additionally aggregate per-stream signals so a stream that fails N
//     sessions in M minutes is demoted from "healthy" globally — protecting
//     other users from the same bad origin.
//
// The threshold model is intentionally simple here: a 3-feature linear model
// with hand-set weights. In production the weights are trained offline against
// labelled QoE traces.
package supervisor

import (
	"context"
	"strconv"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/pytone/pytone/libs/go/pkg/logging"
)

// Supervisor is the closed-loop controller.
type Supervisor struct {
	rdb      *redis.Client
	playback PlaybackClient // for SwapOrigin
	playlist PlaylistClient // for ResolveAltStream

	// per-stream session counters keyed by stream_id.
	mu       sync.Mutex
	failures map[string]*streamCounter
}

type streamCounter struct {
	lastFailAt time.Time
	fails      int
}

// PlaybackClient is the subset of the playback gRPC API we depend on.
type PlaybackClient interface {
	SwapOrigin(ctx context.Context, ticketID, newOriginURL string) error
}

// PlaylistClient is the subset of the playlist-ingestion gRPC API we depend on.
type PlaylistClient interface {
	ResolveAltStream(ctx context.Context, channelID, exceptStreamID string) (newStreamID, newURL string, _ error)
	MarkStreamDegraded(ctx context.Context, streamID string) error
}

// NewSupervisor constructs the supervisor.
func NewSupervisor(rdb *redis.Client, pb PlaybackClient, pl PlaylistClient) *Supervisor {
	return &Supervisor{
		rdb:      rdb,
		playback: pb,
		playlist: pl,
		failures: map[string]*streamCounter{},
	}
}

// Run subscribes to QoE notifications and processes them until ctx is cancelled.
func (s *Supervisor) Run(ctx context.Context) {
	log := logging.From(ctx)
	sub := s.rdb.Subscribe(ctx, "play:qoe")
	defer sub.Close()

	ch := sub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			ticketID := msg.Payload
			if err := s.evaluate(ctx, ticketID); err != nil {
				log.Warn().Err(err).Str("ticket_id", ticketID).Msg("evaluate")
			}
		}
	}
}

// evaluate scores one session and acts.
func (s *Supervisor) evaluate(ctx context.Context, ticketID string) error {
	vals, err := s.rdb.HGetAll(ctx, "play:qoe:"+ticketID).Result()
	if err != nil {
		return err
	}
	if len(vals) == 0 {
		return nil
	}
	rebuffers, _ := strconv.Atoi(vals["rebuffers"])
	bitrateKbps, _ := strconv.Atoi(vals["bitrate_kbps"])
	samples, _ := strconv.Atoi(vals["samples"])
	if samples < 3 {
		// Not enough data yet.
		return nil
	}

	score := scoreSession(rebuffers, bitrateKbps, samples)
	if score < failoverThreshold {
		return nil
	}

	// Decision: swap origin.
	ticketInfo, err := s.rdb.HGetAll(ctx, "play:ticket:"+ticketID).Result()
	if err != nil || len(ticketInfo) == 0 {
		return err
	}
	streamID := ticketInfo["stream_id"]
	channelID := ticketInfo["channel_id"]
	newStreamID, newURL, err := s.playlist.ResolveAltStream(ctx, channelID, streamID)
	if err != nil || newStreamID == "" {
		return err
	}
	if err := s.playback.SwapOrigin(ctx, ticketID, newURL); err != nil {
		return err
	}
	s.recordFailure(streamID)
	return nil
}

// scoreSession returns a normalised "how broken is this" score. The weights
// here are illustrative; in production they come from a model trained on
// labelled QoE traces.
func scoreSession(rebuffers, bitrateKbps, samples int) float64 {
	// Weights are tuned so that any *one* signal at its extreme is enough to
	// trip failover, while combinations of mild deficits compound rather than
	// cancel. Re-tune via the offline trainer when QoE traces update.
	const (
		wRebuffer = 0.5
		wBitrate  = 0.5
	)
	rebufferRate := float64(rebuffers) / float64(samples)
	bitrateDeficit := 0.0
	if bitrateKbps > 0 && bitrateKbps < 1500 {
		bitrateDeficit = (1500.0 - float64(bitrateKbps)) / 1500.0
	}
	return wRebuffer*rebufferRate + wBitrate*bitrateDeficit
}

const failoverThreshold = 0.4

// recordFailure tallies a stream failure and, if it crosses the demotion
// threshold, asks playlist-ingestion to demote it globally.
func (s *Supervisor) recordFailure(streamID string) {
	s.mu.Lock()
	c, ok := s.failures[streamID]
	if !ok {
		c = &streamCounter{}
		s.failures[streamID] = c
	}
	now := time.Now()
	if now.Sub(c.lastFailAt) > 5*time.Minute {
		c.fails = 0
	}
	c.lastFailAt = now
	c.fails++
	demote := c.fails >= 5
	s.mu.Unlock()

	if demote {
		_ = s.playlist.MarkStreamDegraded(context.Background(), streamID)
	}
}
