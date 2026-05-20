package main

import (
	"context"

	"github.com/pytone/pytone/libs/go/pkg/config"
	"github.com/pytone/pytone/libs/go/pkg/logging"
	"github.com/pytone/pytone/libs/go/pkg/server"
	"github.com/pytone/pytone/services/playlist-ingestion/internal/ingest"
)

func main() {
	log := logging.New("playlist-ingestion")
	ctx := logging.Into(context.Background(), log)

	deps, err := ingest.Wire(ctx, ingest.Config{
		DatabaseURL:    config.MustString("DATABASE_URL"),
		RedisURL:       config.MustString("REDIS_URL"),
		KafkaBrokers:   config.CSV("KAFKA_BROKERS"),
		Workers:        config.Int("INGEST_WORKERS", 16),
		HTTPTimeoutSec: config.Int("INGEST_HTTP_TIMEOUT_SEC", 60),
	})
	if err != nil {
		log.Fatal().Err(err).Msg("wire")
	}
	defer deps.Close()

	if err := server.Run(ctx, server.Config{
		Service:  "playlist-ingestion",
		GRPCAddr: config.String("GRPC_ADDR", ":50051"),
		HTTPAddr: config.String("HTTP_ADDR", ":8080"),
		OnGRPC:   deps.RegisterGRPC,
	}); err != nil {
		log.Fatal().Err(err).Msg("server")
	}
}
