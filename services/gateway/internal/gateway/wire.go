// Package gateway implements the edge API for clients.
//
// Responsibilities:
//   - JWT/session authentication
//   - Per-user + per-IP rate limiting (token bucket, Redis-backed)
//   - GraphQL endpoint (federated schema in production; here we ship a
//     pragmatic REST + GraphQL hybrid)
//   - gRPC fan-out to backend services
//   - Response shaping for TV / Mobile / Web clients (different field sets)
package gateway

import (
	"context"
	"net/http"
	"os"
	"strings"

	"github.com/novastream/novastream/libs/go/pkg/config"
	"github.com/redis/go-redis/v9"
)

// Config is the gateway runtime configuration.
type Config struct {
	RedisURL           string
	JWTPublicKeyPEM    string
	Upstreams          Upstreams
	RateLimitPerSecond int
	RateLimitBurst     int
}

// Upstreams is the address book of backend services.
type Upstreams struct {
	Playlist       string
	EPG            string
	DVR            string
	Playback       string
	Search         string
	Recommendation string
	User           string
	Auth           string
	Recording      string
	Sync           string
	Sports         string
	Notification   string
	Analytics      string
}

// LoadUpstreamsFromEnv reads service addresses from env vars.
func LoadUpstreamsFromEnv() Upstreams {
	return Upstreams{
		Playlist:       config.MustString("PLAYLIST_GRPC_ADDR"),
		EPG:            config.MustString("EPG_GRPC_ADDR"),
		DVR:            config.MustString("DVR_GRPC_ADDR"),
		Playback:       config.MustString("PLAYBACK_GRPC_ADDR"),
		Search:         config.MustString("SEARCH_GRPC_ADDR"),
		Recommendation: config.MustString("RECO_GRPC_ADDR"),
		User:           config.MustString("USER_GRPC_ADDR"),
		Auth:           config.MustString("AUTH_GRPC_ADDR"),
		Recording:      strings.TrimSpace(os.Getenv("RECORDING_GRPC_ADDR")),
		Sync:           strings.TrimSpace(os.Getenv("SYNC_GRPC_ADDR")),
		Sports:         strings.TrimSpace(os.Getenv("SPORTS_GRPC_ADDR")),
		Notification:   strings.TrimSpace(os.Getenv("NOTIFY_GRPC_ADDR")),
		Analytics:      strings.TrimSpace(os.Getenv("ANALYTICS_GRPC_ADDR")),
	}
}

// Deps holds wired-up dependencies.
type Deps struct {
	Redis *redis.Client
	Auth  *AuthMW
	Limit *RateLimiter
}

// Wire builds the gateway.
func Wire(ctx context.Context, cfg Config) (*Deps, error) {
	ropt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, err
	}
	rdb := redis.NewClient(ropt)

	auth, err := NewAuthMW(cfg.JWTPublicKeyPEM)
	if err != nil {
		return nil, err
	}
	limit := NewRateLimiter(rdb, cfg.RateLimitPerSecond, cfg.RateLimitBurst)

	return &Deps{Redis: rdb, Auth: auth, Limit: limit}, nil
}

// RegisterHTTP mounts the gateway routes.
//
// Middleware order (outermost first):
//   SecurityHeaders → CORS → AuthMW → RateLimiter → handler
//
// SecurityHeaders runs first so even error responses carry the headers.
// CORS runs before Auth so preflights succeed without a bearer token.
// AuthMW skips public routes (login, register, activate, webhooks).
func (d *Deps) RegisterHTTP(mux *http.ServeMux) {
	allowedOrigins := []string{
		"https://app.novastream.tv",
		"https://staging.app.novastream.tv",
		"http://localhost:3000",
	}
	cors := CORS(allowedOrigins)

	stack := func(h http.Handler) http.Handler {
		return SecurityHeaders(cors(d.Auth.Wrap(d.Limit.Wrap(h))))
	}
	mux.Handle("/graphql", stack(graphqlHandler()))
	mux.Handle("/api/", stack(restHandler()))
}

func (d *Deps) Close() {
	_ = d.Redis.Close()
}

// graphqlHandler is mounted at /graphql. The actual schema definitions live in
// internal/gateway/graphql.go; this stub keeps the wiring file self-contained.
func graphqlHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// {"data":null,"errors":[{"message":"schema not loaded"}]}
		_, _ = w.Write([]byte(`{"data":null}`))
	})
}

func restHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	})
}
