package recorder

import (
	"context"
	"time"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type Config struct {
	DatabaseURL  string
	RedisURL     string
	KafkaBrokers []string
	S3Endpoint   string
	S3Region     string
	S3Bucket     string
	WorkerID     string
	MaxChannels  int
	Retention    time.Duration
	PlaylistGRPC string
	PlaybackGRPC string
}

type Deps struct {
	DB                *pgxpool.Pool
	Redis             *redis.Client
	S3                *s3.Client
	Recorder          *Recorder
	RetentionSweeper  *RetentionSweeper
}

func Wire(ctx context.Context, cfg Config) (*Deps, error) {
	if cfg.Retention == 0 {
		cfg.Retention = 14 * 24 * time.Hour
	}
	db, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}
	ropt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, err
	}
	rdb := redis.NewClient(ropt)

	awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(cfg.S3Region),
	)
	if err != nil {
		return nil, err
	}
	s3c := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		if cfg.S3Endpoint != "" {
			o.BaseEndpoint = &cfg.S3Endpoint
			o.UsePathStyle = true
		}
	})

	store := NewStore(db)
	storage := NewS3Storage(s3c, cfg.S3Bucket)
	leases := NewLeaseManager(rdb, cfg.WorkerID, cfg.MaxChannels)

	rec := NewRecorder(store, storage, leases, cfg.WorkerID)
	sweep := NewRetentionSweeper(store, storage, cfg.Retention)

	return &Deps{DB: db, Redis: rdb, S3: s3c, Recorder: rec, RetentionSweeper: sweep}, nil
}

func (d *Deps) Close() {
	d.DB.Close()
	_ = d.Redis.Close()
}
