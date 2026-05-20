// Package server provides a standardized gRPC + HTTP server harness used by
// every Pytone backend service.
//
// It wires together:
//   - graceful shutdown on SIGINT/SIGTERM
//   - a /healthz endpoint
//   - a Prometheus /metrics endpoint
//   - gRPC server with standard interceptors (logging, recovery, tracing,
//     Prometheus metrics)
package server

import (
	"context"
	"errors"
	"net"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/zerolog"
	"golang.org/x/sync/errgroup"
	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"

	"github.com/pytone/pytone/libs/go/pkg/logging"
)

// Config configures the harness.
type Config struct {
	Service     string
	GRPCAddr    string // ":50051"
	HTTPAddr    string // ":8080" – health + metrics
	OnGRPC      func(s *grpc.Server)
	OnHTTP      func(mux *http.ServeMux)
	Shutdown    time.Duration // grace period, default 25s
	Interceptor grpc.UnaryServerInterceptor
}

// Run starts the harness. It blocks until the process receives SIGINT/SIGTERM,
// then attempts a graceful shutdown of all components.
func Run(parent context.Context, cfg Config) error {
	if cfg.Shutdown == 0 {
		cfg.Shutdown = 25 * time.Second
	}
	if cfg.GRPCAddr == "" {
		cfg.GRPCAddr = ":50051"
	}
	if cfg.HTTPAddr == "" {
		cfg.HTTPAddr = ":8080"
	}

	log := logging.New(cfg.Service)
	ctx, stop := signal.NotifyContext(parent, syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// gRPC -----------------------------------------------------------------
	gOpts := []grpc.ServerOption{
		grpc.ChainUnaryInterceptor(
			recoveryInterceptor(log),
			loggingInterceptor(log),
		),
	}
	gsrv := grpc.NewServer(gOpts...)
	healthSrv := health.NewServer()
	healthpb.RegisterHealthServer(gsrv, healthSrv)
	reflection.Register(gsrv)
	if cfg.OnGRPC != nil {
		cfg.OnGRPC(gsrv)
	}
	healthSrv.SetServingStatus("", healthpb.HealthCheckResponse_SERVING)

	gln, err := net.Listen("tcp", cfg.GRPCAddr)
	if err != nil {
		return err
	}
	log.Info().Str("addr", cfg.GRPCAddr).Msg("gRPC listening")

	// HTTP (health + metrics) ---------------------------------------------
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.Handle("/metrics", promhttp.Handler())
	if cfg.OnHTTP != nil {
		cfg.OnHTTP(mux)
	}
	hsrv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	// Run ------------------------------------------------------------------
	eg, egCtx := errgroup.WithContext(ctx)
	eg.Go(func() error { return gsrv.Serve(gln) })
	eg.Go(func() error {
		if err := hsrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	})
	eg.Go(func() error {
		<-egCtx.Done()
		log.Info().Msg("shutting down")

		shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.Shutdown)
		defer cancel()

		done := make(chan struct{})
		go func() { gsrv.GracefulStop(); close(done) }()
		select {
		case <-done:
		case <-shutdownCtx.Done():
			gsrv.Stop()
		}
		_ = hsrv.Shutdown(shutdownCtx)
		return nil
	})

	if err := eg.Wait(); err != nil && !errors.Is(err, context.Canceled) {
		log.Error().Err(err).Msg("server exited with error")
		return err
	}
	return nil
}

func recoveryInterceptor(log zerolog.Logger) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (resp any, err error) {
		defer func() {
			if r := recover(); r != nil {
				log.Error().Interface("panic", r).Str("method", info.FullMethod).Msg("recovered from panic")
				err = errors.New("internal error")
			}
		}()
		return handler(ctx, req, info)
	}
}

func loggingInterceptor(log zerolog.Logger) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		start := time.Now()
		ctx = logging.Into(ctx, log)
		resp, err := handler(ctx, req)
		ev := log.Info()
		if err != nil {
			ev = log.Warn().Err(err)
		}
		ev.
			Str("method", info.FullMethod).
			Dur("dur", time.Since(start)).
			Msg("rpc")
		return resp, err
	}
}
