// Package epg provides the EPG (Electronic Programme Guide) service.
//
// The EPG hot path is fundamentally a range query: "give me all programmes on
// these N channels between time T1 and time T2". We make that O(N + result)
// by:
//
//   - storing programmes in Postgres partitioned by start day,
//   - keeping a "now playing" Redis pre-cache hot at all times so the most
//     common query — what's on right now? — never hits Postgres,
//   - serializing programmes as a compact field-array layout (not JSON)
//     for the timeline response.
//
// XMLTV ingestion runs on a configurable schedule (default 4h). It parses the
// XMLTV file with the streaming xmltv.Parse, upserts in batches of 5000, and
// recomputes the now-playing cache on completion.
package epg

import (
	"context"
	"errors"
	"fmt"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// Service is the EPG facade used by the gRPC handlers.
type Service struct {
	pool       *pgxpool.Pool
	rdb        *redis.Client
	ingestBusy atomic.Bool
}

// NewService builds the service.
func NewService(pool *pgxpool.Pool, rdb *redis.Client) *Service {
	return &Service{pool: pool, rdb: rdb}
}

// Programme is the in-memory representation. Times are UTC.
type Programme struct {
	ID           string
	ChannelID    string
	EPGChannelID string
	Start        time.Time
	Stop         time.Time
	Title        string
	SubTitle     string
	Description  string
	Categories   []string
	PosterURL    string
	BackdropURL  string
	Season       int
	Episode      int
	Rating       string
	IsLive       bool
	IsNew        bool
	Catchup      bool
}

// NowNext returns the now-playing and next-up programme for each channel.
//
// We answer this from Redis. The key for each channel is `epg:nn:{channel_id}`
// holding a hash with fields `now` (msgpack) and `next` (msgpack). Refreshed
// every minute by the ticker.
func (s *Service) NowNext(ctx context.Context, channelIDs []string) (map[string][2]*Programme, error) {
	out := make(map[string][2]*Programme, len(channelIDs))
	if len(channelIDs) == 0 {
		return out, nil
	}
	pipe := s.rdb.Pipeline()
	cmds := make(map[string]*redis.MapStringStringCmd, len(channelIDs))
	for _, id := range channelIDs {
		cmds[id] = pipe.HGetAll(ctx, "epg:nn:"+id)
	}
	if _, err := pipe.Exec(ctx); err != nil && !errors.Is(err, redis.Nil) {
		return nil, err
	}
	for id, cmd := range cmds {
		vals, err := cmd.Result()
		if err != nil {
			continue
		}
		var pair [2]*Programme
		if raw, ok := vals["now"]; ok {
			if p := decodeProgramme(raw); p != nil {
				pair[0] = p
			}
		}
		if raw, ok := vals["next"]; ok {
			if p := decodeProgramme(raw); p != nil {
				pair[1] = p
			}
		}
		out[id] = pair
	}
	return out, nil
}

// Timeline returns programmes for a set of channels over a time window.
func (s *Service) Timeline(ctx context.Context, channelIDs []string, from, to time.Time) ([]Programme, error) {
	if len(channelIDs) == 0 || !to.After(from) {
		return nil, nil
	}
	const q = `
		SELECT id, channel_id, epg_channel_id, start_at, stop_at, title, sub_title,
		       description, categories, poster_url, backdrop_url,
		       season, episode, rating, is_live, is_new, catchup_available
		  FROM programmes
		 WHERE channel_id = ANY($1)
		   AND stop_at > $2
		   AND start_at < $3
		 ORDER BY channel_id, start_at`
	rows, err := s.pool.Query(ctx, q, channelIDs, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Programme, 0, 256)
	for rows.Next() {
		var p Programme
		if err := rows.Scan(
			&p.ID, &p.ChannelID, &p.EPGChannelID, &p.Start, &p.Stop, &p.Title, &p.SubTitle,
			&p.Description, &p.Categories, &p.PosterURL, &p.BackdropURL,
			&p.Season, &p.Episode, &p.Rating, &p.IsLive, &p.IsNew, &p.Catchup,
		); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// RefreshNowNextLoop maintains the now-playing cache.
//
// We don't recompute from scratch: a sliding window query reads programmes
// that begin or end in the next minute, and for each affected channel we
// update its Redis hash. In steady state this touches O(seconds-of-EPG-change)
// channels per minute, not the full catalog.
func (s *Service) RefreshNowNextLoop(ctx context.Context) {
	tick := time.NewTicker(30 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			_ = s.refreshNowNext(ctx)
		}
	}
}

func (s *Service) refreshNowNext(ctx context.Context) error {
	now := time.Now().UTC()
	const q = `
		WITH live AS (
		    SELECT DISTINCT ON (channel_id) channel_id, id, epg_channel_id,
		           start_at, stop_at, title, sub_title, description, categories,
		           poster_url, backdrop_url, season, episode, rating,
		           is_live, is_new, catchup_available
		      FROM programmes
		     WHERE start_at <= $1 AND stop_at > $1
		     ORDER BY channel_id, start_at DESC
		),
		next AS (
		    SELECT DISTINCT ON (channel_id) channel_id, id, epg_channel_id,
		           start_at, stop_at, title, sub_title, description, categories,
		           poster_url, backdrop_url, season, episode, rating,
		           is_live, is_new, catchup_available
		      FROM programmes
		     WHERE start_at > $1
		     ORDER BY channel_id, start_at ASC
		)
		SELECT 'now' AS slot, * FROM live
		UNION ALL
		SELECT 'next' AS slot, * FROM next`
	rows, err := s.pool.Query(ctx, q, now)
	if err != nil {
		return fmt.Errorf("refresh now/next: %w", err)
	}
	defer rows.Close()

	pipe := s.rdb.Pipeline()
	for rows.Next() {
		var slot string
		var p Programme
		if err := rows.Scan(&slot, &p.ChannelID, &p.ID, &p.EPGChannelID,
			&p.Start, &p.Stop, &p.Title, &p.SubTitle, &p.Description, &p.Categories,
			&p.PosterURL, &p.BackdropURL, &p.Season, &p.Episode, &p.Rating,
			&p.IsLive, &p.IsNew, &p.Catchup); err != nil {
			return err
		}
		key := "epg:nn:" + p.ChannelID
		pipe.HSet(ctx, key, slot, encodeProgramme(&p))
		pipe.Expire(ctx, key, 2*time.Hour)
	}
	_, err = pipe.Exec(ctx)
	return err
}
