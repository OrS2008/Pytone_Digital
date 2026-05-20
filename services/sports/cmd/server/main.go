package main

import (
	"context"

	"github.com/pytone/pytone/libs/go/pkg/config"
	"github.com/pytone/pytone/libs/go/pkg/logging"
	"github.com/pytone/pytone/libs/go/pkg/server"
)

// Sports service.
//
// Owns:
//   - leagues / teams / players entities
//   - live score feeds (websocket subscriptions to data providers)
//   - event markers (goal, card, substitution, lap, set) anchored to
//     stream wall-clock time so the client can render in-player overlays
//   - spoiler protection: if a user opts in, scores and event titles are
//     redacted from EPG metadata until they've watched
//   - multi-view: returns synchronised PIDs for related streams (eg main +
//     onboard camera in F1, or 4 court streams at the US Open)
//   - AI highlight generation: post-match, audio-energy + event-time anchors
//     drive ffmpeg cut points to produce a 5-minute highlight reel
func main() {
	log := logging.New("sports")
	ctx := logging.Into(context.Background(), log)
	if err := server.Run(ctx, server.Config{
		Service:  "sports",
		GRPCAddr: config.String("GRPC_ADDR", ":50067"),
		HTTPAddr: config.String("HTTP_ADDR", ":8080"),
	}); err != nil {
		log.Fatal().Err(err).Msg("server")
	}
}
