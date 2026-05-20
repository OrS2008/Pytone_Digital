package main

import (
	"context"

	"github.com/pytone/pytone/libs/go/pkg/config"
	"github.com/pytone/pytone/libs/go/pkg/logging"
	"github.com/pytone/pytone/libs/go/pkg/server"
	"github.com/pytone/pytone/services/gateway/internal/gateway"
)

func main() {
	log := logging.New("gateway")
	ctx := logging.Into(context.Background(), log)

	deps, err := gateway.Wire(ctx, gateway.Config{
		RedisURL:           config.MustString("REDIS_URL"),
		JWTPublicKeyPEM:    config.MustString("JWT_PUBLIC_KEY_PEM"),
		Upstreams:          gateway.LoadUpstreamsFromEnv(),
		RateLimitPerSecond: config.Int("RATE_LIMIT_PER_SECOND", 50),
		RateLimitBurst:     config.Int("RATE_LIMIT_BURST", 100),
	})
	if err != nil {
		log.Fatal().Err(err).Msg("wire")
	}
	defer deps.Close()

	if err := server.Run(ctx, server.Config{
		Service:  "gateway",
		GRPCAddr: config.String("GRPC_ADDR", ":50050"),
		HTTPAddr: config.String("HTTP_ADDR", ":8080"),
		OnHTTP:   deps.RegisterHTTP,
	}); err != nil {
		log.Fatal().Err(err).Msg("server")
	}
}
