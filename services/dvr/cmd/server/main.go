package main

import (
	"context"

	"github.com/novastream/novastream/libs/go/pkg/config"
	"github.com/novastream/novastream/libs/go/pkg/logging"
	"github.com/novastream/novastream/libs/go/pkg/server"
	"github.com/novastream/novastream/services/dvr/internal/dvr"
)

func main() {
	log := logging.New("dvr")
	ctx := logging.Into(context.Background(), log)

	deps, err := dvr.Wire(ctx, dvr.Config{
		DatabaseURL:   config.MustString("DATABASE_URL"),
		RedisURL:      config.MustString("REDIS_URL"),
		S3PublicURL:   config.MustString("S3_PUBLIC_URL"),
		ManifestKey:   []byte(config.MustString("MANIFEST_SIGNING_KEY")),
	})
	if err != nil {
		log.Fatal().Err(err).Msg("wire")
	}
	defer deps.Close()

	if err := server.Run(ctx, server.Config{
		Service:  "dvr",
		GRPCAddr: config.String("GRPC_ADDR", ":50056"),
		HTTPAddr: config.String("HTTP_ADDR", ":8080"),
		OnGRPC:   deps.RegisterGRPC,
		OnHTTP:   deps.RegisterHTTP,
	}); err != nil {
		log.Fatal().Err(err).Msg("server")
	}
}
