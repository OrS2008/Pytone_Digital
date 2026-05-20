package main

import (
	"context"

	"github.com/pytone/pytone/libs/go/pkg/config"
	"github.com/pytone/pytone/libs/go/pkg/logging"
	"github.com/pytone/pytone/libs/go/pkg/server"
)

// Metadata service.
//
// On `playlist.updated` / `epg.updated`, the worker enriches each new channel
// or programme:
//
//   - tries TMDB / TVDB / OMDb in order
//   - falls back to an LLM categorizer (we prompt with title + description +
//     channel context) for items not in those catalogs
//   - downloads + cleans posters to the CDN bucket (max 512x768, WebP)
//   - extracts entities (actors, directors, teams, leagues) and writes them
//     to the `entities` table for relationship-based recommendation
//   - computes 384-dim text embeddings for semantic search
//
// All enrichment is idempotent and identified by an external content hash so
// repeated runs are cheap.
func main() {
	log := logging.New("metadata")
	ctx := logging.Into(context.Background(), log)
	if err := server.Run(ctx, server.Config{
		Service:  "metadata",
		GRPCAddr: config.String("GRPC_ADDR", ":50062"),
		HTTPAddr: config.String("HTTP_ADDR", ":8080"),
	}); err != nil {
		log.Fatal().Err(err).Msg("server")
	}
}
