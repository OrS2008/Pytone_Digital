package recorder

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Store wraps Postgres persistence for the recording service.
type Store interface {
	RecordSegment(ctx context.Context, s SegmentRow) error
	ListSegmentsForRetention(ctx context.Context, olderThan time.Time, limit int) ([]SegmentRow, error)
	DeleteSegments(ctx context.Context, ids []int64) error
}

// SegmentRow mirrors the `dvr_segments` table.
type SegmentRow struct {
	ID         int64
	ChannelID  string
	Sequence   uint64
	StartedAt  time.Time
	DurationMs int
	ObjectKey  string
	Bytes      int64
	SourceURL  string
}

// pgStore is the Postgres implementation.
type pgStore struct {
	pool *pgxpool.Pool
}

// NewStore wraps a pgxpool.
func NewStore(pool *pgxpool.Pool) Store {
	return &pgStore{pool: pool}
}

func (s *pgStore) RecordSegment(ctx context.Context, r SegmentRow) error {
	const q = `
		INSERT INTO dvr_segments
			(channel_id, sequence, started_at, duration_ms, object_key, bytes, source_url)
		VALUES
			($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (channel_id, started_at) DO NOTHING`
	_, err := s.pool.Exec(ctx, q,
		r.ChannelID, r.Sequence, r.StartedAt, r.DurationMs, r.ObjectKey, r.Bytes, r.SourceURL,
	)
	return err
}

func (s *pgStore) ListSegmentsForRetention(ctx context.Context, olderThan time.Time, limit int) ([]SegmentRow, error) {
	if limit <= 0 {
		limit = 1000
	}
	const q = `
		SELECT id, channel_id, sequence, started_at, duration_ms, object_key, bytes, source_url
		  FROM dvr_segments
		 WHERE started_at < $1
		 ORDER BY started_at
		 LIMIT $2`
	rows, err := s.pool.Query(ctx, q, olderThan, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SegmentRow
	for rows.Next() {
		var r SegmentRow
		if err := rows.Scan(&r.ID, &r.ChannelID, &r.Sequence, &r.StartedAt,
			&r.DurationMs, &r.ObjectKey, &r.Bytes, &r.SourceURL); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *pgStore) DeleteSegments(ctx context.Context, ids []int64) error {
	if len(ids) == 0 {
		return nil
	}
	_, err := s.pool.Exec(ctx, "DELETE FROM dvr_segments WHERE id = ANY($1)", ids)
	return err
}
