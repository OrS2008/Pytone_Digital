package auth

import (
	"context"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc"
)

type Config struct {
	DatabaseURL    string
	RedisURL       string
	JWTPrivPEM     string
	AccessTTL      time.Duration
	RefreshTTL     time.Duration
	PasswordPepper []byte
}

type Deps struct {
	DB      *pgxpool.Pool
	Redis   *redis.Client
	Service *Service
}

func Wire(ctx context.Context, cfg Config) (*Deps, error) {
	db, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}
	ropt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, err
	}
	rdb := redis.NewClient(ropt)

	priv, err := jwt.ParseRSAPrivateKeyFromPEM([]byte(cfg.JWTPrivPEM))
	if err != nil {
		return nil, err
	}
	svc := NewService(db, priv, cfg.PasswordPepper, cfg.AccessTTL, cfg.RefreshTTL)
	return &Deps{DB: db, Redis: rdb, Service: svc}, nil
}

func (d *Deps) RegisterGRPC(g *grpc.Server) {
	_ = g
}

func (d *Deps) Close() {
	d.DB.Close()
	_ = d.Redis.Close()
}
