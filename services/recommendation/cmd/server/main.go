package main

import (
	"context"

	"github.com/pytone/pytone/libs/go/pkg/config"
	"github.com/pytone/pytone/libs/go/pkg/logging"
	"github.com/pytone/pytone/libs/go/pkg/server"
)

// Recommendation service.
//
// Pipeline (online):
//   1) Personalized home rows are generated from:
//      a) collaborative filtering scores (matrix factorization, refreshed
//         nightly into Postgres)
//      b) content embeddings (384-dim, computed by metadata service)
//      c) recency boost from watch_history
//      d) live now-playing on favorite channels
//   2) Each row is a candidate ranker:
//      - "Continue Watching" reads watch_history where !finished
//      - "Because you watched X" expands neighbours of X
//      - "Trending now" reads a 5-minute rolling popularity window
//   3) Diversification (MMR) ensures no two adjacent items share too many
//      attributes (same genre, same series).
//
// Pipeline (offline):
//   - Nightly Spark job re-fits the CF model on (user, item, action) events.
//   - Per-genre popularity rollups on ClickHouse.
//
// The service exposes only the online path; offline jobs live in
// /infrastructure/jobs.
func main() {
	log := logging.New("recommendation")
	ctx := logging.Into(context.Background(), log)
	if err := server.Run(ctx, server.Config{
		Service:  "recommendation",
		GRPCAddr: config.String("GRPC_ADDR", ":50061"),
		HTTPAddr: config.String("HTTP_ADDR", ":8080"),
	}); err != nil {
		log.Fatal().Err(err).Msg("server")
	}
}
