package main

import (
	"context"

	"github.com/pytone/pytone/libs/go/pkg/config"
	"github.com/pytone/pytone/libs/go/pkg/logging"
	"github.com/pytone/pytone/libs/go/pkg/server"
)

// Search service.
//
// We use Typesense as the primary index (sub-100ms typeahead even at tens of
// millions of documents) plus a side-car vector index for semantic queries.
//
// Indexed corpora (each as its own Typesense collection):
//   - channels       (name, categories, country, language)
//   - programmes     (title, description, categories)
//   - movies         (title, year, cast, director, genres, plot)
//   - series         (title, seasons, episodes, cast, genres)
//   - recordings     (title, dvr metadata)
//   - sports_events  (teams, league, kickoff)
//
// Cross-corpus relevance is unified via the `/search/everything` endpoint
// which fans out concurrently and merges with custom scoring weights.
//
// Semantic queries: client sends `"action movies like John Wick"`. We embed
// the query with a 384-dim sentence-transformer running as a sidecar, then
// nearest-neighbour against the `movies_embed` collection. The two result
// streams (BM25 + ANN) are merged with reciprocal rank fusion.
func main() {
	log := logging.New("search")
	ctx := logging.Into(context.Background(), log)
	if err := server.Run(ctx, server.Config{
		Service:  "search",
		GRPCAddr: config.String("GRPC_ADDR", ":50060"),
		HTTPAddr: config.String("HTTP_ADDR", ":8080"),
	}); err != nil {
		log.Fatal().Err(err).Msg("server")
	}
}
