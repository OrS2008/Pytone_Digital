package epg

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc"
)

type Config struct {
	DatabaseURL  string
	RedisURL     string
	Sources      []string
	RefreshEvery time.Duration
}

type Deps struct {
	DB        *pgxpool.Pool
	Redis     *redis.Client
	Service   *Service
	Scheduler *Scheduler
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

	svc := NewService(db, rdb)
	go svc.RefreshNowNextLoop(ctx)

	sched := NewScheduler(db, cfg.Sources, cfg.RefreshEvery, func(ctx context.Context) {
		_ = svc.refreshNowNext(ctx)
	})
	return &Deps{DB: db, Redis: rdb, Service: svc, Scheduler: sched}, nil
}

func (d *Deps) RegisterGRPC(g *grpc.Server) {
	// epgv1.RegisterEpgServiceServer(g, &grpcServer{svc: d.Service})
	_ = g
}

func (d *Deps) Close() {
	d.DB.Close()
	_ = d.Redis.Close()
}
