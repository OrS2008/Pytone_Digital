// Package recorder implements the segment-level recording engine.
//
// Recording strategy: rather than transcoding a live stream into a single
// container file, we copy HLS segments verbatim into object storage. Benefits:
//   - zero re-encoding cost (CPU and quality preserved)
//   - constant-time replay seeks (segment-aligned)
//   - safe to recover from worker crashes (segments are independent)
//   - VOD manifest can be built on-the-fly for any window
//
// Concurrency model: one goroutine per channel claimed by this worker. Each
// goroutine polls the channel's live HLS manifest at the segment cadence,
// detects new segments via #EXTINF + URL, fetches them, and writes both the
// segment bytes (to S3) and an index row (to Postgres) inside the same
// "transaction" — we write S3 first, then Postgres, so an interrupted recorder
// can be safely re-run without re-uploading duplicate bytes.
package recorder

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/pytone/pytone/libs/go/pkg/logging"
)

// Recorder is the per-worker engine that records claimed channels.
type Recorder struct {
	store    Store
	storage  Storage
	leases   *LeaseManager
	workerID string

	httpClient *http.Client
}

// NewRecorder constructs a recorder.
func NewRecorder(store Store, storage Storage, leases *LeaseManager, workerID string) *Recorder {
	return &Recorder{
		store:    store,
		storage:  storage,
		leases:   leases,
		workerID: workerID,
		httpClient: &http.Client{
			Timeout: 8 * time.Second,
		},
	}
}

// Run drives the worker until ctx is cancelled. It maintains the set of
// claimed channels and (re)spawns per-channel goroutines as leases change.
func (r *Recorder) Run(ctx context.Context) {
	log := logging.From(ctx)
	cancellers := map[string]context.CancelFunc{}

	for {
		select {
		case <-ctx.Done():
			for _, c := range cancellers {
				c()
			}
			return
		case <-time.After(5 * time.Second):
		}

		claimed, err := r.leases.Refresh(ctx)
		if err != nil {
			log.Warn().Err(err).Msg("refresh leases")
			continue
		}
		want := make(map[string]struct{}, len(claimed))
		for _, ch := range claimed {
			want[ch.ID] = struct{}{}
			if _, running := cancellers[ch.ID]; running {
				continue
			}
			cctx, cancel := context.WithCancel(ctx)
			cancellers[ch.ID] = cancel
			ch := ch
			go func() {
				err := r.recordChannel(cctx, ch)
				if err != nil && !errors.Is(err, context.Canceled) {
					log.Warn().Err(err).Str("channel_id", ch.ID).Msg("recorder stopped")
				}
			}()
		}
		// Cancel any channels no longer claimed.
		for id, cancel := range cancellers {
			if _, ok := want[id]; !ok {
				cancel()
				delete(cancellers, id)
			}
		}
	}
}

// recordChannel runs forever for a single channel.
func (r *Recorder) recordChannel(ctx context.Context, ch RecordableChannel) error {
	log := logging.From(ctx).With().Str("channel_id", ch.ID).Logger()
	log.Info().Msg("recording started")

	seenSegs := newSeenRing(512)
	mediaSeq := uint64(0)
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		segs, targetDur, err := r.fetchMediaPlaylist(ctx, ch.OriginURL)
		if err != nil {
			log.Warn().Err(err).Msg("manifest fetch failed")
			time.Sleep(2 * time.Second)
			continue
		}

		var fetches []segmentRef
		for _, s := range segs {
			if seenSegs.seen(s.URI) {
				continue
			}
			seenSegs.add(s.URI)
			fetches = append(fetches, s)
		}

		if len(fetches) > 0 {
			// Download segments in parallel but bounded by 4 to avoid
			// hammering the origin.
			eg, egCtx := errgroup.WithContext(ctx)
			sem := make(chan struct{}, 4)
			for _, s := range fetches {
				s := s
				mediaSeq++
				seq := mediaSeq
				sem <- struct{}{}
				eg.Go(func() error {
					defer func() { <-sem }()
					return r.persistSegment(egCtx, ch, s, seq)
				})
			}
			if err := eg.Wait(); err != nil {
				log.Warn().Err(err).Msg("segment batch failed")
			}
		}

		// Sleep for ~half the target duration so we never miss a segment.
		sleep := time.Duration(targetDur*500) * time.Millisecond
		if sleep < 500*time.Millisecond {
			sleep = 500 * time.Millisecond
		}
		if sleep > 4*time.Second {
			sleep = 4 * time.Second
		}
		time.Sleep(sleep)
	}
}

type segmentRef struct {
	URI        string
	DurationMs int
}

func (r *Recorder) fetchMediaPlaylist(ctx context.Context, manifestURL string) ([]segmentRef, int, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, manifestURL, nil)
	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return nil, 0, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	base, _ := url.Parse(manifestURL)

	var segs []segmentRef
	var targetDuration int
	var pendingDur int
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 64<<10), 1<<20)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		switch {
		case strings.HasPrefix(line, "#EXT-X-TARGETDURATION:"):
			n, _ := strconv.Atoi(strings.TrimPrefix(line, "#EXT-X-TARGETDURATION:"))
			targetDuration = n
		case strings.HasPrefix(line, "#EXTINF:"):
			rest := strings.TrimPrefix(line, "#EXTINF:")
			if c := strings.IndexByte(rest, ','); c >= 0 {
				rest = rest[:c]
			}
			f, _ := strconv.ParseFloat(strings.TrimSpace(rest), 64)
			pendingDur = int(f * 1000)
		case strings.HasPrefix(line, "#"):
			continue
		case line == "":
			continue
		default:
			ref, err := url.Parse(line)
			if err == nil && base != nil {
				line = base.ResolveReference(ref).String()
			}
			segs = append(segs, segmentRef{URI: line, DurationMs: pendingDur})
			pendingDur = 0
		}
	}
	if err := sc.Err(); err != nil {
		return nil, 0, err
	}
	return segs, targetDuration, nil
}

func (r *Recorder) persistSegment(ctx context.Context, ch RecordableChannel, s segmentRef, seq uint64) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, s.URI, nil)
	resp, err := r.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("segment HTTP %d", resp.StatusCode)
	}

	now := time.Now().UTC()
	objKey := segmentKey(ch.ID, now, seq, s.DurationMs)
	if err := r.storage.Put(ctx, objKey, resp.Body, resp.ContentLength); err != nil {
		return err
	}
	return r.store.RecordSegment(ctx, SegmentRow{
		ChannelID:  ch.ID,
		Sequence:   seq,
		StartedAt:  now,
		DurationMs: s.DurationMs,
		ObjectKey:  objKey,
		Bytes:      resp.ContentLength,
		SourceURL:  s.URI,
	})
}

// segmentKey constructs the deterministic object key for a recorded segment.
func segmentKey(channelID string, at time.Time, seq uint64, durationMs int) string {
	return path.Join(
		"dvr",
		channelID,
		at.Format("2006/01/02/15"),
		fmt.Sprintf("%d-%d-%d.ts", at.UnixMilli(), seq, durationMs),
	)
}

// --- segment dedupe ring ----------------------------------------------------

// seenRing is a small fixed-size LRU-ish set used to skip segments we already
// downloaded in this session. We don't need perfect dedupe; the DB UNIQUE
// constraint is the source of truth.
type seenRing struct {
	cap  int
	keys []string
	set  map[string]struct{}
}

func newSeenRing(cap int) *seenRing {
	return &seenRing{cap: cap, keys: make([]string, 0, cap), set: make(map[string]struct{}, cap)}
}

func (r *seenRing) seen(k string) bool {
	_, ok := r.set[k]
	return ok
}

func (r *seenRing) add(k string) {
	if _, ok := r.set[k]; ok {
		return
	}
	if len(r.keys) == r.cap {
		evict := r.keys[0]
		r.keys = r.keys[1:]
		delete(r.set, evict)
	}
	r.keys = append(r.keys, k)
	r.set[k] = struct{}{}
}

// keep io referenced for io.Discard usage in tests
var _ = io.Discard
