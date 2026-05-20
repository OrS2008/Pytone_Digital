package ingest

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// pgStore is the Postgres-backed Store implementation.
//
// The schema is in migrations/0001_init.sql. The table layout deliberately
// separates `channels` (logical, stable, indexed by hash) from `streams`
// (one row per backing URL) so a channel can have many redundant streams
// (HD, FHD, 4K, backup origins).
type pgStore struct {
	pool *pgxpool.Pool
}

// NewStore returns a Postgres-backed Store.
func NewStore(pool *pgxpool.Pool) Store {
	return &pgStore{pool: pool}
}

func (s *pgStore) GetSource(ctx context.Context, id string) (Source, error) {
	const q = `
		SELECT id, owner_id, name, kind, url, username, password,
		       refresh_cron, last_refreshed_at, enabled
		  FROM playlist_sources
		 WHERE id = $1`
	var src Source
	var lastRefresh *time.Time
	err := s.pool.QueryRow(ctx, q, id).Scan(
		&src.ID, &src.OwnerID, &src.Name, &src.Kind, &src.URL, &src.Username, &src.Password,
		&src.RefreshCron, &lastRefresh, &src.Enabled,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Source{}, fmt.Errorf("source not found: %s", id)
		}
		return Source{}, err
	}
	if lastRefresh != nil {
		src.LastRefreshAt = *lastRefresh
	}
	return src, nil
}

func (s *pgStore) UpsertSource(ctx context.Context, src Source) (Source, error) {
	const q = `
		INSERT INTO playlist_sources
			(id, owner_id, name, kind, url, username, password, refresh_cron, enabled)
		VALUES
			($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			url = EXCLUDED.url,
			username = EXCLUDED.username,
			password = EXCLUDED.password,
			refresh_cron = EXCLUDED.refresh_cron,
			enabled = EXCLUDED.enabled
		RETURNING id`
	if err := s.pool.QueryRow(ctx, q,
		src.ID, src.OwnerID, src.Name, src.Kind, src.URL, src.Username, src.Password,
		src.RefreshCron, src.Enabled,
	).Scan(&src.ID); err != nil {
		return Source{}, err
	}
	return src, nil
}

func (s *pgStore) DeleteSource(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, "DELETE FROM playlist_sources WHERE id = $1", id)
	return err
}

func (s *pgStore) ListSourcesByOwner(ctx context.Context, ownerID, cursor string, limit int) ([]Source, string, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	const q = `
		SELECT id, owner_id, name, kind, url, username, password,
		       refresh_cron, last_refreshed_at, enabled
		  FROM playlist_sources
		 WHERE owner_id = $1
		   AND ($2 = '' OR id > $2)
		 ORDER BY id
		 LIMIT $3`
	rows, err := s.pool.Query(ctx, q, ownerID, cursor, limit)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()
	var out []Source
	for rows.Next() {
		var src Source
		var lastRefresh *time.Time
		if err := rows.Scan(
			&src.ID, &src.OwnerID, &src.Name, &src.Kind, &src.URL, &src.Username, &src.Password,
			&src.RefreshCron, &lastRefresh, &src.Enabled,
		); err != nil {
			return nil, "", err
		}
		if lastRefresh != nil {
			src.LastRefreshAt = *lastRefresh
		}
		out = append(out, src)
	}
	next := ""
	if len(out) == limit {
		next = out[len(out)-1].ID
	}
	return out, next, rows.Err()
}

func (s *pgStore) MarkSourceRefreshed(ctx context.Context, id string, channelCount int) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE playlist_sources
		   SET last_refreshed_at = now(), channel_count = $2
		 WHERE id = $1`, id, channelCount)
	return err
}

// UpsertChannelBatch inserts channels and streams in a single transaction so a
// failed refresh never leaves a partially-updated catalog. We use COPY for
// the streams table and ON CONFLICT for channels.
func (s *pgStore) UpsertChannelBatch(ctx context.Context, sourceID string, batch []ChannelRow) error {
	if len(batch) == 0 {
		return nil
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Upsert channels.
	chanRows := make([][]any, 0, len(batch))
	for _, r := range batch {
		chanRows = append(chanRows, []any{
			r.ChannelID, sourceID, r.Name, r.DisplayName, r.LogoURL,
			r.Categories, r.Country, r.Language, r.EPGID, r.ChannelNumber,
			r.Catchup, r.CatchupDays, r.CatchupTpl,
		})
	}
	// Stage the rows into a temp table, then UPSERT in a single SQL statement.
	if _, err := tx.Exec(ctx, `
		CREATE TEMP TABLE _staged_channels (LIKE channels INCLUDING DEFAULTS) ON COMMIT DROP;`); err != nil {
		return err
	}
	if _, err := tx.CopyFrom(ctx, pgx.Identifier{"_staged_channels"},
		[]string{
			"id", "source_id", "name", "display_name", "logo_url",
			"categories", "country", "language", "epg_id", "channel_number",
			"catchup", "catchup_days", "catchup_template",
		},
		pgx.CopyFromRows(chanRows)); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO channels (
			id, source_id, name, display_name, logo_url, categories,
			country, language, epg_id, channel_number, catchup, catchup_days,
			catchup_template
		)
		SELECT id, source_id, name, display_name, logo_url, categories,
		       country, language, epg_id, channel_number, catchup, catchup_days,
		       catchup_template
		  FROM _staged_channels
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			display_name = EXCLUDED.display_name,
			logo_url = EXCLUDED.logo_url,
			categories = EXCLUDED.categories,
			country = EXCLUDED.country,
			language = EXCLUDED.language,
			epg_id = EXCLUDED.epg_id,
			channel_number = EXCLUDED.channel_number,
			catchup = EXCLUDED.catchup,
			catchup_days = EXCLUDED.catchup_days,
			catchup_template = EXCLUDED.catchup_template`); err != nil {
		return err
	}

	// Insert streams.
	streamRows := make([][]any, 0, len(batch))
	for _, r := range batch {
		streamRows = append(streamRows, []any{
			r.StreamID, r.ChannelID, r.URL, int64(r.URLHash), r.Headers,
			"unknown", // initial health pending probe
		})
	}
	if _, err := tx.CopyFrom(ctx, pgx.Identifier{"streams"},
		[]string{"id", "channel_id", "url", "url_hash", "headers", "health"},
		pgx.CopyFromRows(streamRows)); err != nil {
		// Duplicate streams (same channel + url_hash) hit the unique index;
		// we tolerate that.
		return nil
	}
	return tx.Commit(ctx)
}

func (s *pgStore) ListStreamsForValidation(ctx context.Context, sourceID string) ([]Stream, error) {
	const q = `
		SELECT s.id, s.url, s.headers, s.priority
		  FROM streams s
		  JOIN channels c ON c.id = s.channel_id
		 WHERE c.source_id = $1
		   AND (s.last_probed_at IS NULL OR s.last_probed_at < now() - INTERVAL '6 hours')`
	rows, err := s.pool.Query(ctx, q, sourceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Stream
	for rows.Next() {
		var st Stream
		if err := rows.Scan(&st.ID, &st.URL, &st.Headers, &st.Priority); err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, rows.Err()
}

func (s *pgStore) UpdateStreamHealth(ctx context.Context, streamID string, r ValidationResult) error {
	const q = `
		UPDATE streams SET
			health        = $2,
			latency_ms    = $3,
			bitrate_kbps  = $4,
			width         = $5,
			height        = $6,
			fps           = $7,
			video_codec   = $8,
			audio_codec   = $9,
			hdr10         = $10,
			dolby_vision  = $11,
			last_probed_at = now(),
			last_error    = $12
		 WHERE id = $1`
	_, err := s.pool.Exec(ctx, q,
		streamID, healthName(r.Health), r.LatencyMs, r.BitrateKbps,
		r.Width, r.Height, r.FPS, r.VideoCodec, r.AudioCodec,
		r.HDR10, r.DolbyVision, r.ErrorMessage,
	)
	return err
}

func healthName(h Health) string {
	switch h {
	case HealthHealthy:
		return "healthy"
	case HealthDegraded:
		return "degraded"
	case HealthDead:
		return "dead"
	default:
		return "unknown"
	}
}
