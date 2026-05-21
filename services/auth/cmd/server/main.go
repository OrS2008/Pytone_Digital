package main

import (
	"context"

	"github.com/novastream/novastream/libs/go/pkg/config"
	"github.com/novastream/novastream/libs/go/pkg/logging"
	"github.com/novastream/novastream/libs/go/pkg/server"
	"github.com/novastream/novastream/services/auth/internal/auth"
)

func main() {
	log := logging.New("auth")
	ctx := logging.Into(context.Background(), log)

	deps, err := auth.Wire(ctx, auth.Config{
		DatabaseURL:    config.MustString("DATABASE_URL"),
		RedisURL:       config.MustString("REDIS_URL"),
		JWTPrivPEM:     config.MustString("JWT_PRIVATE_KEY_PEM"),
		AccessTTL:      config.Duration("ACCESS_TTL", 0),
		RefreshTTL:     config.Duration("REFRESH_TTL", 0),
		PasswordPepper: []byte(config.MustString("PASSWORD_PEPPER")),
	})
	if err != nil {
		log.Fatal().Err(err).Msg("wire")
	}
	defer deps.Close()

	if err := server.Run(ctx, server.Config{
		Service:  "auth",
		GRPCAddr: config.String("GRPC_ADDR", ":50058"),
		HTTPAddr: config.String("HTTP_ADDR", ":8080"),
		OnGRPC:   deps.RegisterGRPC,
	}); err != nil {
		log.Fatal().Err(err).Msg("server")
	}
}
