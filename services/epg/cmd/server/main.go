package main

import (
	"context"

	"github.com/pytone/pytone/libs/go/pkg/config"
	"github.com/pytone/pytone/libs/go/pkg/logging"
	"github.com/pytone/pytone/libs/go/pkg/server"
	"github.com/pytone/pytone/services/epg/internal/epg"
)

func main() {
	log := logging.New("epg")
	ctx := logging.Into(context.Background(), log)

	deps, err := epg.Wire(ctx, epg.Config{
		DatabaseURL:  config.MustString("DATABASE_URL"),
		RedisURL:     config.MustString("REDIS_URL"),
		Sources:      config.CSV("XMLTV_SOURCES"),
		RefreshEvery: config.Duration("REFRESH_EVERY", 0),
	})
	if err != nil {
		log.Fatal().Err(err).Msg("wire")
	}
	defer deps.Close()

	go deps.Scheduler.Run(ctx)

	if err := server.Run(ctx, server.Config{
		Service:  "epg",
		GRPCAddr: config.String("GRPC_ADDR", ":50055"),
		HTTPAddr: config.String("HTTP_ADDR", ":8080"),
		OnGRPC:   deps.RegisterGRPC,
	}); err != nil {
		log.Fatal().Err(err).Msg("server")
	}
}
