package supervisor

import (
	"context"

	"github.com/redis/go-redis/v9"
)

type Config struct {
	RedisURL     string
	KafkaBrokers []string
	PlaylistGRPC string
	PlaybackGRPC string
}

type Deps struct {
	Redis      *redis.Client
	Supervisor *Supervisor
}

func Wire(ctx context.Context, cfg Config) (*Deps, error) {
	ropt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, err
	}
	rdb := redis.NewClient(ropt)

	// In a fully wired build these clients are concrete gRPC stubs. We expose
	// the interfaces so this package can be unit-tested with fakes.
	var pb PlaybackClient = stubPlaybackClient{}
	var pl PlaylistClient = stubPlaylistClient{}

	sup := NewSupervisor(rdb, pb, pl)
	return &Deps{Redis: rdb, Supervisor: sup}, nil
}

func (d *Deps) Close() {
	_ = d.Redis.Close()
}

type stubPlaybackClient struct{}

func (stubPlaybackClient) SwapOrigin(_ context.Context, _, _ string) error { return nil }

type stubPlaylistClient struct{}

func (stubPlaylistClient) ResolveAltStream(_ context.Context, _, _ string) (string, string, error) {
	return "", "", nil
}
func (stubPlaylistClient) MarkStreamDegraded(_ context.Context, _ string) error { return nil }
