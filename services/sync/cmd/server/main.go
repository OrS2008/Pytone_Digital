package main

import (
	"context"

	"github.com/novastream/novastream/libs/go/pkg/config"
	"github.com/novastream/novastream/libs/go/pkg/logging"
	"github.com/novastream/novastream/libs/go/pkg/server"
)

// Sync service.
//
// Cross-device sync for:
//   - continue-watching position
//   - favourites
//   - watch history
//   - playback preferences (audio, subtitles, max bitrate)
//
// Each user has a CRDT document (Last-Writer-Wins map for scalars, OR-Set for
// favourites). Clients open a websocket; the server pushes deltas to all
// other devices on the user's account within ~2 seconds.
//
// The CRDT implementation lives in internal/sync/crdt.go and is the same one
// used inside the Flutter client cache so client-side merges are bit-for-bit
// identical to server-side merges.
func main() {
	log := logging.New("sync")
	ctx := logging.Into(context.Background(), log)
	if err := server.Run(ctx, server.Config{
		Service:  "sync",
		GRPCAddr: config.String("GRPC_ADDR", ":50068"),
		HTTPAddr: config.String("HTTP_ADDR", ":8080"),
	}); err != nil {
		log.Fatal().Err(err).Msg("server")
	}
}
