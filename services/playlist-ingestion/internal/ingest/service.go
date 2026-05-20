// Package ingest implements the playlist ingestion service.
//
// The ingestion pipeline is built around three stages:
//
//  1. Fetch:    pull the playlist body from the source (HTTP / Xtream API).
//  2. Parse:    stream-parse the body, emitting Entry values.
//  3. Persist:  upsert channels, dedupe streams, mark dead streams. Each batch
//               is written in a single transaction so a half-finished refresh
//               never leaves the catalog in an inconsistent state.
//
// Stage 3 also produces Kafka events (`playlist.updated`) so downstream
// services (metadata enrichment, EPG matching, search indexing) can react.
package ingest

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/cespare/xxhash/v2"
	"github.com/google/uuid"
	"golang.org/x/sync/errgroup"
	"google.golang.org/grpc"

	"github.com/pytone/pytone/libs/go/pkg/logging"
	"github.com/pytone/pytone/libs/go/pkg/m3u"
)

// Service orchestrates ingestion.
type Service struct {
	store     Store
	bus       Bus
	fetcher   Fetcher
	validator StreamValidator
	workers   int

	mu      sync.Mutex
	running map[string]context.CancelFunc // source_id -> cancel for in-flight refresh
}

// NewService wires the orchestrator.
func NewService(store Store, bus Bus, fetcher Fetcher, validator StreamValidator, workers int) *Service {
	if workers <= 0 {
		workers = 8
	}
	return &Service{
		store:     store,
		bus:       bus,
		fetcher:   fetcher,
		validator: validator,
		workers:   workers,
		running:   map[string]context.CancelFunc{},
	}
}

// Register attaches gRPC handlers. We register the public handlers in a
// separate file; this method exists so wire.go can keep its interface narrow.
func (s *Service) Register(g *grpc.Server) {
	registerGRPC(g, s)
}

// Refresh ingests a single source. It is safe to call concurrently for
// different source IDs; concurrent calls for the same source are coalesced
// (the second call cancels the first).
func (s *Service) Refresh(ctx context.Context, sourceID string) (string, error) {
	src, err := s.store.GetSource(ctx, sourceID)
	if err != nil {
		return "", fmt.Errorf("load source: %w", err)
	}
	if !src.Enabled {
		return "", errors.New("source disabled")
	}

	jobID := uuid.NewString()
	jobCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Minute)
	s.mu.Lock()
	if prev, ok := s.running[sourceID]; ok {
		prev() // cancel previous in-flight refresh
	}
	s.running[sourceID] = cancel
	s.mu.Unlock()

	go func() {
		defer func() {
			s.mu.Lock()
			if cur, ok := s.running[sourceID]; ok && &cur == &cancel {
				delete(s.running, sourceID)
			}
			s.mu.Unlock()
			cancel()
		}()
		if err := s.runRefresh(jobCtx, src, jobID); err != nil {
			lg := logging.From(jobCtx)
			lg.Error().Err(err).Str("source_id", src.ID).Msg("refresh failed")
		}
	}()

	return jobID, nil
}

func (s *Service) runRefresh(ctx context.Context, src Source, jobID string) error {
	log := logging.From(ctx).With().Str("source_id", src.ID).Str("job_id", jobID).Logger()
	log.Info().Msg("refresh started")
	start := time.Now()

	body, closeFn, err := s.fetcher.Fetch(ctx, src)
	if err != nil {
		return fmt.Errorf("fetch: %w", err)
	}
	defer closeFn()

	entries := make(chan m3u.Entry, 1024)
	parser := m3u.New(body)

	// Producer.
	eg, egCtx := errgroup.WithContext(ctx)
	eg.Go(func() error { return parser.ParseInto(egCtx, entries) })

	// Consumers: persist + validate in parallel. We funnel parsed entries into
	// the persistence batcher, which flushes in 500-row batches.
	batcher := newBatcher(s.store, src.ID, 500)
	eg.Go(func() error {
		seen := make(map[uint64]struct{}, 4096)
		for {
			select {
			case <-egCtx.Done():
				return egCtx.Err()
			case e, ok := <-entries:
				if !ok {
					return batcher.Flush(egCtx)
				}
				// In-memory dedupe by URL hash before hitting the database.
				h := xxhash.Sum64String(e.URL)
				if _, dup := seen[h]; dup {
					continue
				}
				seen[h] = struct{}{}
				batcher.Add(e)
				if batcher.Full() {
					if err := batcher.Flush(egCtx); err != nil {
						return err
					}
				}
			}
		}
	})

	if err := eg.Wait(); err != nil {
		return err
	}

	if err := s.store.MarkSourceRefreshed(ctx, src.ID, batcher.Count()); err != nil {
		return err
	}
	if err := s.bus.PublishPlaylistUpdated(ctx, src.ID, batcher.Count()); err != nil {
		log.Warn().Err(err).Msg("kafka publish failed")
	}

	log.Info().
		Int("channels", batcher.Count()).
		Dur("duration", time.Since(start)).
		Msg("refresh complete")

	// Validate streams in the background — we don't block the refresh on this.
	go s.validateStreams(context.WithoutCancel(ctx), src.ID)
	return nil
}

// validateStreams probes streams concurrently to detect dead URLs and to
// auto-detect codec / bitrate / resolution. Findings are written back to the
// store and a Kafka event is emitted per stream so AI-playback can react.
func (s *Service) validateStreams(ctx context.Context, sourceID string) {
	streams, err := s.store.ListStreamsForValidation(ctx, sourceID)
	if err != nil {
		lg := logging.From(ctx)
		lg.Error().Err(err).Msg("list streams for validation")
		return
	}

	sem := make(chan struct{}, s.workers)
	var wg sync.WaitGroup
	for _, st := range streams {
		st := st
		sem <- struct{}{}
		wg.Add(1)
		go func() {
			defer func() { <-sem; wg.Done() }()
			result := s.validator.Validate(ctx, st)
			if err := s.store.UpdateStreamHealth(ctx, st.ID, result); err != nil {
				lg := logging.From(ctx)
				lg.Warn().Err(err).Str("stream_id", st.ID).Msg("update stream health")
				return
			}
			if result.Health == HealthDead {
				_ = s.bus.PublishStreamDead(ctx, st.ID)
			}
		}()
	}
	wg.Wait()
}
