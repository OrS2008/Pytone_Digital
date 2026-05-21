package playback

import (
	"context"
	"net/http"

	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc"
)

type Config struct {
	RedisURL           string
	TicketSigningKey   []byte
	ProxyOrigin        string // public URL the client should hit, e.g. https://play.novastream.tv
	PlaylistGRPCAddr   string
	AIPlaybackGRPCAddr string
}

type Deps struct {
	Redis  *redis.Client
	Tickets *TicketService
	Proxy   *ProxyHandler
}

func Wire(ctx context.Context, cfg Config) (*Deps, error) {
	ropt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, err
	}
	rdb := redis.NewClient(ropt)
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, err
	}

	tickets := NewTicketService(rdb, cfg.TicketSigningKey, cfg.ProxyOrigin)
	proxy := NewProxyHandler(tickets, NewABRSteering(rdb))
	return &Deps{Redis: rdb, Tickets: tickets, Proxy: proxy}, nil
}

func (d *Deps) RegisterGRPC(g *grpc.Server) {
	// playbackv1.RegisterPlaybackServiceServer(g, &grpcServer{tickets: d.Tickets})
	_ = g
}

func (d *Deps) RegisterHTTP(mux *http.ServeMux) {
	mux.Handle("/play/", d.Proxy)
}

func (d *Deps) Close() {
	_ = d.Redis.Close()
}
