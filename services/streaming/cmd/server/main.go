package main

import (
	"context"

	"github.com/pytone/pytone/libs/go/pkg/config"
	"github.com/pytone/pytone/libs/go/pkg/logging"
	"github.com/pytone/pytone/libs/go/pkg/server"
)

// Streaming service.
//
// Where playback proxies and signs URLs, the streaming service is the
// *origin router*. Given a (channel, viewer, geo, network), it returns the
// best origin URL according to:
//
//   - origin health (from ai-playback signals)
//   - geo proximity (each origin is tagged with a region)
//   - load (origins report concurrent sessions every 5s)
//   - cost (some origins are paid per-GB)
//
// In production this would be a Rust service for predictable latency; the Go
// skeleton here exists to lock in the interface that gateway / playback
// depend on.
func main() {
	log := logging.New("streaming")
	ctx := logging.Into(context.Background(), log)
	if err := server.Run(ctx, server.Config{
		Service:  "streaming",
		GRPCAddr: config.String("GRPC_ADDR", ":50063"),
		HTTPAddr: config.String("HTTP_ADDR", ":8080"),
	}); err != nil {
		log.Fatal().Err(err).Msg("server")
	}
}
