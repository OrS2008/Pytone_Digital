package main

import (
	"context"

	"github.com/novastream/novastream/libs/go/pkg/config"
	"github.com/novastream/novastream/libs/go/pkg/logging"
	"github.com/novastream/novastream/libs/go/pkg/server"
)

// The user service owns:
//   - profiles (multiple per account; "Kids", "Movies night", etc.)
//   - per-profile preferences (preferred audio, subtitle language, parental
//     rating cap, autoplay behavior, video quality cap)
//   - watch history (last-N watched per content kind, used by recommendation)
//   - favourites (channels, programmes, series)
//
// The schema lives in migrations/0001_init.sql.
func main() {
	log := logging.New("user")
	ctx := logging.Into(context.Background(), log)
	if err := server.Run(ctx, server.Config{
		Service:  "user",
		GRPCAddr: config.String("GRPC_ADDR", ":50059"),
		HTTPAddr: config.String("HTTP_ADDR", ":8080"),
	}); err != nil {
		log.Fatal().Err(err).Msg("server")
	}
}
