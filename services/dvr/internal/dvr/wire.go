package dvr

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc"
)

type Config struct {
	DatabaseURL string
	RedisURL    string
	S3PublicURL string
	ManifestKey []byte
}

type Deps struct {
	DB         *pgxpool.Pool
	Redis      *redis.Client
	Manifests  *ManifestBuilder
	Scheduler  *RecordingScheduler
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

	mb := NewManifestBuilder(db, cfg.S3PublicURL, cfg.ManifestKey)
	sched := NewRecordingScheduler(db, rdb)
	go sched.Run(ctx)

	return &Deps{DB: db, Redis: rdb, Manifests: mb, Scheduler: sched}, nil
}

func (d *Deps) RegisterGRPC(g *grpc.Server) {
	// dvrv1.RegisterDvrServiceServer(g, &grpcServer{deps: d})
	_ = g
}

func (d *Deps) RegisterHTTP(mux *http.ServeMux) {
	mux.HandleFunc("/dvr/manifest/", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		_ = ctx
		// Real handler parses channel/from/to from path/query and calls
		// d.Manifests.Build. Omitted to keep this file compact.
		w.WriteHeader(http.StatusNotImplemented)
	})
}

func (d *Deps) Close() {
	d.DB.Close()
	_ = d.Redis.Close()
}
