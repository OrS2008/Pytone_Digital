package epg

import (
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/pytone/pytone/libs/go/pkg/logging"
	"github.com/pytone/pytone/libs/go/pkg/xmltv"
)

// Scheduler pulls XMLTV sources on a fixed cadence.
type Scheduler struct {
	pool         *pgxpool.Pool
	sources      []string
	every        time.Duration
	client       *http.Client
	postIngestFn func(ctx context.Context) // called after each successful ingest
}

// NewScheduler wires the EPG scheduler.
func NewScheduler(pool *pgxpool.Pool, sources []string, every time.Duration, postIngest func(ctx context.Context)) *Scheduler {
	if every == 0 {
		every = 4 * time.Hour
	}
	return &Scheduler{
		pool:         pool,
		sources:      sources,
		every:        every,
		client:       &http.Client{Timeout: 5 * time.Minute},
		postIngestFn: postIngest,
	}
}

// Run loops until ctx is cancelled, ingesting each source on `every` cadence.
func (s *Scheduler) Run(ctx context.Context) {
	log := logging.From(ctx)
	// Kick off an immediate ingestion so a fresh deployment is useful within a
	// few minutes.
	for _, src := range s.sources {
		if err := s.ingest(ctx, src); err != nil {
			log.Warn().Err(err).Str("src", src).Msg("initial ingest failed")
		}
	}
	if s.postIngestFn != nil {
		s.postIngestFn(ctx)
	}

	t := time.NewTicker(s.every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		for _, src := range s.sources {
			if err := s.ingest(ctx, src); err != nil {
				log.Warn().Err(err).Str("src", src).Msg("ingest failed")
			}
		}
		if s.postIngestFn != nil {
			s.postIngestFn(ctx)
		}
	}
}

// ingest streams an XMLTV file into the programmes table.
func (s *Scheduler) ingest(ctx context.Context, url string) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	req.Header.Set("Accept-Encoding", "gzip")
	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	var r io.Reader = resp.Body
	if strings.EqualFold(resp.Header.Get("Content-Encoding"), "gzip") || strings.HasSuffix(url, ".gz") {
		gz, err := gzip.NewReader(resp.Body)
		if err != nil {
			return err
		}
		defer gz.Close()
		r = gz
	}

	batch := newProgrammeBatch(s.pool, 5000)
	sink := &ingestSink{batch: batch}
	if err := xmltv.Parse(ctx, r, sink); err != nil {
		return err
	}
	return batch.Flush(ctx)
}

type ingestSink struct {
	batch *programmeBatch
}

func (s *ingestSink) OnChannel(_ xmltv.Channel) error {
	// Channel rows from XMLTV are advisory: the real channel catalog is owned
	// by playlist-ingestion. We could persist them to a side table for
	// fuzzy matching; omitted here for brevity.
	return nil
}

func (s *ingestSink) OnProgramme(p xmltv.Programme) error {
	return s.batch.Add(context.Background(), p)
}

// programmeBatch buffers programme inserts and flushes via COPY for speed.
type programmeBatch struct {
	pool  *pgxpool.Pool
	limit int
	buf   []xmltv.Programme
}

func newProgrammeBatch(pool *pgxpool.Pool, limit int) *programmeBatch {
	return &programmeBatch{pool: pool, limit: limit, buf: make([]xmltv.Programme, 0, limit)}
}

func (b *programmeBatch) Add(ctx context.Context, p xmltv.Programme) error {
	b.buf = append(b.buf, p)
	if len(b.buf) >= b.limit {
		return b.Flush(ctx)
	}
	return nil
}

func (b *programmeBatch) Flush(ctx context.Context) error {
	if len(b.buf) == 0 {
		return nil
	}
	rows := make([][]any, 0, len(b.buf))
	for _, p := range b.buf {
		// Resolve channel_id from epg_channel_id via the channels table.
		// In production this would be a single SQL with a join; we keep it as
		// a lateral subquery in the INSERT below.
		rows = append(rows, []any{
			p.ChannelID, p.Start, p.Stop, p.Title, p.SubTitle, p.Description,
			p.Categories, p.Icon, p.Season, p.Episode, p.Rating, p.Live, p.New,
		})
	}
	tx, err := b.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `
		CREATE TEMP TABLE _staged_programmes (
			epg_channel_id TEXT NOT NULL,
			start_at TIMESTAMPTZ NOT NULL,
			stop_at TIMESTAMPTZ NOT NULL,
			title TEXT NOT NULL,
			sub_title TEXT NOT NULL DEFAULT '',
			description TEXT NOT NULL DEFAULT '',
			categories TEXT[] NOT NULL DEFAULT '{}',
			poster_url TEXT NOT NULL DEFAULT '',
			season INTEGER NOT NULL DEFAULT 0,
			episode INTEGER NOT NULL DEFAULT 0,
			rating TEXT NOT NULL DEFAULT '',
			is_live BOOLEAN NOT NULL DEFAULT FALSE,
			is_new BOOLEAN NOT NULL DEFAULT FALSE
		) ON COMMIT DROP`); err != nil {
		return err
	}
	if _, err := tx.CopyFrom(ctx, pgx.Identifier{"_staged_programmes"},
		[]string{"epg_channel_id", "start_at", "stop_at", "title", "sub_title", "description",
			"categories", "poster_url", "season", "episode", "rating", "is_live", "is_new"},
		pgx.CopyFromRows(rows)); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO programmes (
			id, channel_id, epg_channel_id, start_at, stop_at, title, sub_title,
			description, categories, poster_url, season, episode, rating,
			is_live, is_new, catchup_available
		)
		SELECT
			gen_random_uuid(),
			c.id,
			s.epg_channel_id,
			s.start_at, s.stop_at, s.title, s.sub_title, s.description,
			s.categories, s.poster_url, s.season, s.episode, s.rating,
			s.is_live, s.is_new,
			c.catchup_days > 0
		  FROM _staged_programmes s
		  JOIN channels c ON c.epg_id = s.epg_channel_id
		ON CONFLICT (channel_id, start_at) DO UPDATE SET
			stop_at = EXCLUDED.stop_at,
			title = EXCLUDED.title,
			sub_title = EXCLUDED.sub_title,
			description = EXCLUDED.description,
			categories = EXCLUDED.categories,
			poster_url = EXCLUDED.poster_url,
			season = EXCLUDED.season,
			episode = EXCLUDED.episode,
			rating = EXCLUDED.rating,
			is_live = EXCLUDED.is_live,
			is_new = EXCLUDED.is_new,
			catchup_available = EXCLUDED.catchup_available`); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	b.buf = b.buf[:0]
	return nil
}
