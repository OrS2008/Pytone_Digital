package dvr

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/novastream/novastream/libs/go/pkg/logging"
)

// RecordingScheduler reacts to series rules and EPG updates by inserting
// scheduled recordings, and reacts to programme start times by promoting
// scheduled recordings to active recordings (the recording workers pick those
// up via the leases set).
type RecordingScheduler struct {
	pool *pgxpool.Pool
	rdb  *redis.Client
}

// NewRecordingScheduler wires the scheduler.
func NewRecordingScheduler(pool *pgxpool.Pool, rdb *redis.Client) *RecordingScheduler {
	return &RecordingScheduler{pool: pool, rdb: rdb}
}

// Run loops until ctx is cancelled. Two ticks:
//   - every 30s: expand series rules into individual recordings for the next 7d
//   - every 5s:  promote scheduled recordings whose start has passed
func (s *RecordingScheduler) Run(ctx context.Context) {
	log := logging.From(ctx)
	expand := time.NewTicker(30 * time.Second)
	defer expand.Stop()
	promote := time.NewTicker(5 * time.Second)
	defer promote.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-expand.C:
			if err := s.expandSeriesRules(ctx); err != nil {
				log.Warn().Err(err).Msg("expand series")
			}
		case <-promote.C:
			if err := s.promoteScheduled(ctx); err != nil {
				log.Warn().Err(err).Msg("promote scheduled")
			}
		}
	}
}

// expandSeriesRules turns each series rule into concrete recordings by joining
// against the programmes table for the next 7 days.
func (s *RecordingScheduler) expandSeriesRules(ctx context.Context) error {
	const q = `
		INSERT INTO recordings (
			id, user_id, channel_id, programme_id, title, kind, state,
			scheduled_start, scheduled_stop, padding_start_seconds, padding_stop_seconds
		)
		SELECT
			gen_random_uuid(), r.user_id, p.channel_id, p.id, p.title, r.kind,
			'scheduled',
			p.start_at - (r.padding_start_seconds * INTERVAL '1 second'),
			p.stop_at  + (r.padding_stop_seconds  * INTERVAL '1 second'),
			r.padding_start_seconds,
			r.padding_stop_seconds
		  FROM series_rules r
		  JOIN programmes p ON (
		      (r.channel_id IS NULL OR p.channel_id = r.channel_id)
		      AND (r.series_id = '' OR p.id::text = r.series_id)
		      AND (r.keyword   = '' OR p.title ILIKE '%' || r.keyword || '%')
		      AND (NOT r.new_only OR p.is_new)
		  )
		 WHERE p.start_at BETWEEN now() AND now() + INTERVAL '7 days'
		 ON CONFLICT (user_id, channel_id, programme_id) DO NOTHING`
	_, err := s.pool.Exec(ctx, q)
	return err
}

// promoteScheduled moves scheduled recordings into the recordable set so
// recording workers pick them up.
func (s *RecordingScheduler) promoteScheduled(ctx context.Context) error {
	const q = `
		SELECT channel_id FROM recordings
		 WHERE state = 'scheduled'
		   AND scheduled_start <= now()
		 GROUP BY channel_id`
	rows, err := s.pool.Query(ctx, q)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var ch string
		if err := rows.Scan(&ch); err != nil {
			return err
		}
		_ = s.rdb.SAdd(ctx, "dvr:recordable", ch).Err()
	}
	return rows.Err()
}
