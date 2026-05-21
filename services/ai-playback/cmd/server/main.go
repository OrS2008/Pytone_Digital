package main

import (
	"context"

	"github.com/novastream/novastream/libs/go/pkg/config"
	"github.com/novastream/novastream/libs/go/pkg/logging"
	"github.com/novastream/novastream/libs/go/pkg/server"
	"github.com/novastream/novastream/services/ai-playback/internal/supervisor"
)

func main() {
	log := logging.New("ai-playback")
	ctx := logging.Into(context.Background(), log)

	deps, err := supervisor.Wire(ctx, supervisor.Config{
		RedisURL:     config.MustString("REDIS_URL"),
		KafkaBrokers: config.CSV("KAFKA_BROKERS"),
		PlaylistGRPC: config.MustString("PLAYLIST_GRPC_ADDR"),
		PlaybackGRPC: config.MustString("PLAYBACK_GRPC_ADDR"),
	})
	if err != nil {
		log.Fatal().Err(err).Msg("wire")
	}
	defer deps.Close()

	go deps.Supervisor.Run(ctx)

	if err := server.Run(ctx, server.Config{
		Service:  "ai-playback",
		GRPCAddr: config.String("GRPC_ADDR", ":50057"),
		HTTPAddr: config.String("HTTP_ADDR", ":8080"),
	}); err != nil {
		log.Fatal().Err(err).Msg("server")
	}
}
