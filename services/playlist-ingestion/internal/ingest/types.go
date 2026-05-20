package ingest

import (
	"context"
	"io"
	"time"
)

// Source mirrors the proto representation of a playlist source.
type Source struct {
	ID            string
	OwnerID       string
	Name          string
	Kind          string // m3u, xtream, stalker, hls, dash, jellyfin, plex, smb, nfs, ota, local
	URL           string
	Username      string
	Password      string
	RefreshCron   string
	LastRefreshAt time.Time
	Enabled       bool
}

// Stream represents a probeable backing URL.
type Stream struct {
	ID       string
	URL      string
	Headers  map[string]string
	Priority int
}

// Health enumerates measured stream health.
type Health int

const (
	HealthUnknown Health = iota
	HealthHealthy
	HealthDegraded
	HealthDead
)

// ValidationResult is the outcome of probing one stream.
type ValidationResult struct {
	Health         Health
	LatencyMs      int
	BitrateKbps    int
	Width          int
	Height         int
	FPS            int
	VideoCodec     string
	AudioCodec     string
	HDR10          bool
	DolbyVision    bool
	ErrorMessage   string
}

// Store is the persistence boundary; implemented by store.go against Postgres.
type Store interface {
	GetSource(ctx context.Context, id string) (Source, error)
	UpsertSource(ctx context.Context, s Source) (Source, error)
	DeleteSource(ctx context.Context, id string) error
	ListSourcesByOwner(ctx context.Context, ownerID, cursor string, limit int) ([]Source, string, error)
	MarkSourceRefreshed(ctx context.Context, id string, channelCount int) error

	UpsertChannelBatch(ctx context.Context, sourceID string, batch []ChannelRow) error

	ListStreamsForValidation(ctx context.Context, sourceID string) ([]Stream, error)
	UpdateStreamHealth(ctx context.Context, streamID string, r ValidationResult) error
}

// ChannelRow is the persistence representation of one parsed channel + its
// primary stream. Multiple streams for the same channel are deduped at the
// caller; secondary streams are inserted as additional rows referencing the
// same logical channel.
type ChannelRow struct {
	ChannelID     string
	StreamID      string
	Name          string
	DisplayName   string
	LogoURL       string
	Categories    []string
	Country       string
	Language      string
	EPGID         string
	ChannelNumber int
	URL           string
	URLHash       uint64
	Headers       map[string]string
	Catchup       string
	CatchupDays   int
	CatchupTpl    string
}

// Bus emits Kafka events.
type Bus interface {
	PublishPlaylistUpdated(ctx context.Context, sourceID string, channels int) error
	PublishStreamDead(ctx context.Context, streamID string) error
}

// Fetcher pulls the playlist body.
type Fetcher interface {
	Fetch(ctx context.Context, src Source) (io.Reader, func(), error)
}

// StreamValidator probes a single stream.
type StreamValidator interface {
	Validate(ctx context.Context, st Stream) ValidationResult
}
