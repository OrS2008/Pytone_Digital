package main

import (
	"context"

	"github.com/pytone/pytone/libs/go/pkg/config"
	"github.com/pytone/pytone/libs/go/pkg/logging"
	"github.com/pytone/pytone/libs/go/pkg/server"
)

// Transcoding service.
//
// Orchestrates ffmpeg / nv-codec workers for:
//   - subtitle burn-in (when client cannot render external subs)
//   - opening MPEG-TS streams into LL-HLS for clients that don't support TS
//   - downscaling 4K masters to mobile-friendly variants on demand
//   - audio track repackaging (AC3 -> AAC for browsers)
//
// Each transcoding job is described by a JSON `Job` posted to Kafka topic
// `transcoding.requested`. Workers consume the topic, run ffmpeg in a sandbox
// (gVisor), upload the result to S3, and post `transcoding.completed`.
//
// Critically we never re-encode live streams unless requested — the system
// prefers copy-only repackaging to preserve quality and CPU.
func main() {
	log := logging.New("transcoding")
	ctx := logging.Into(context.Background(), log)
	if err := server.Run(ctx, server.Config{
		Service:  "transcoding",
		GRPCAddr: config.String("GRPC_ADDR", ":50064"),
		HTTPAddr: config.String("HTTP_ADDR", ":8080"),
	}); err != nil {
		log.Fatal().Err(err).Msg("server")
	}
}
