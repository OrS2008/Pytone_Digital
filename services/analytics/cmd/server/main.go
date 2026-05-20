package main

import (
	"context"

	"github.com/pytone/pytone/libs/go/pkg/config"
	"github.com/pytone/pytone/libs/go/pkg/logging"
	"github.com/pytone/pytone/libs/go/pkg/server"
)

// Analytics service.
//
// Subscribes to:
//   - playback.qoe       (rebuffering, startup time, bitrate, decoder drops)
//   - user.activity      (play, pause, scrub, channel switch)
//   - stream.health      (origin observations)
//   - dvr.recording.*    (capacity utilisation, retention)
//
// Writes raw events to ClickHouse for high-cardinality analysis, and
// pre-aggregated 1-min / 5-min / 1-hour rollups for the operator dashboard.
//
// QoE rollups feed back into ai-playback for cross-session stream scoring:
// a stream that p95-rebuffers across 50 viewers in the last 10 minutes is
// objectively worse than one that p95-rebuffers across 5.
func main() {
	log := logging.New("analytics")
	ctx := logging.Into(context.Background(), log)
	if err := server.Run(ctx, server.Config{
		Service:  "analytics",
		GRPCAddr: config.String("GRPC_ADDR", ":50065"),
		HTTPAddr: config.String("HTTP_ADDR", ":8080"),
	}); err != nil {
		log.Fatal().Err(err).Msg("server")
	}
}
