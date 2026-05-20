package main

import (
	"context"

	"github.com/pytone/pytone/libs/go/pkg/config"
	"github.com/pytone/pytone/libs/go/pkg/logging"
	"github.com/pytone/pytone/libs/go/pkg/server"
	"github.com/pytone/pytone/services/playback/internal/playback"
)

func main() {
	log := logging.New("playback")
	ctx := logging.Into(context.Background(), log)

	deps, err := playback.Wire(ctx, playback.Config{
		RedisURL:           config.MustString("REDIS_URL"),
		TicketSigningKey:   []byte(config.MustString("TICKET_SIGNING_KEY")),
		ProxyOrigin:        config.MustString("PROXY_ORIGIN"),
		PlaylistGRPCAddr:   config.MustString("PLAYLIST_GRPC_ADDR"),
		AIPlaybackGRPCAddr: config.String("AI_PLAYBACK_GRPC_ADDR", ""),
	})
	if err != nil {
		log.Fatal().Err(err).Msg("wire")
	}
	defer deps.Close()

	if err := server.Run(ctx, server.Config{
		Service:  "playback",
		GRPCAddr: config.String("GRPC_ADDR", ":50053"),
		HTTPAddr: config.String("HTTP_ADDR", ":8080"),
		OnGRPC:   deps.RegisterGRPC,
		OnHTTP:   deps.RegisterHTTP,
	}); err != nil {
		log.Fatal().Err(err).Msg("server")
	}
}
