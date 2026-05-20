package ingest

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"
	"google.golang.org/grpc"
)

// Config carries the runtime configuration for the ingestion service.
type Config struct {
	DatabaseURL    string
	RedisURL       string
	KafkaBrokers   []string
	Workers        int
	HTTPTimeoutSec int
}

// Deps holds wired-up runtime dependencies.
type Deps struct {
	DB         *pgxpool.Pool
	Redis      *redis.Client
	KafkaWrite *kafka.Writer
	Service    *Service
}

// Wire builds all infrastructure dependencies.
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

	kw := &kafka.Writer{
		Addr:         kafka.TCP(cfg.KafkaBrokers...),
		Balancer:     &kafka.Hash{},
		RequiredAcks: kafka.RequireOne,
		BatchTimeout: 50 * time.Millisecond,
		Async:        true,
	}

	store := NewStore(db)
	bus := NewKafkaBus(kw)
	fetcher := NewHTTPFetcher(time.Duration(cfg.HTTPTimeoutSec) * time.Second)
	validator := NewStreamValidator(fetcher)
	svc := NewService(store, bus, fetcher, validator, cfg.Workers)

	return &Deps{DB: db, Redis: rdb, KafkaWrite: kw, Service: svc}, nil
}

// RegisterGRPC registers the service against a gRPC server.
func (d *Deps) RegisterGRPC(s *grpc.Server) {
	d.Service.Register(s)
}

// Close releases dependencies.
func (d *Deps) Close() {
	d.DB.Close()
	_ = d.Redis.Close()
	_ = d.KafkaWrite.Close()
}
