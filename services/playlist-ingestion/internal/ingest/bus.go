package ingest

import (
	"context"
	"encoding/json"
	"time"

	"github.com/segmentio/kafka-go"
)

const (
	topicPlaylistUpdated = "playlist.updated"
	topicStreamDead      = "stream.dead"
)

// kafkaBus emits the playlist-ingestion service's domain events.
type kafkaBus struct {
	writer *kafka.Writer
}

// NewKafkaBus wraps a kafka.Writer.
func NewKafkaBus(w *kafka.Writer) Bus {
	return &kafkaBus{writer: w}
}

type playlistUpdatedEvent struct {
	SourceID  string    `json:"source_id"`
	Channels  int       `json:"channels"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (b *kafkaBus) PublishPlaylistUpdated(ctx context.Context, sourceID string, channels int) error {
	payload, _ := json.Marshal(playlistUpdatedEvent{
		SourceID:  sourceID,
		Channels:  channels,
		UpdatedAt: time.Now().UTC(),
	})
	return b.writer.WriteMessages(ctx, kafka.Message{
		Topic: topicPlaylistUpdated,
		Key:   []byte(sourceID),
		Value: payload,
	})
}

type streamDeadEvent struct {
	StreamID   string    `json:"stream_id"`
	DetectedAt time.Time `json:"detected_at"`
}

func (b *kafkaBus) PublishStreamDead(ctx context.Context, streamID string) error {
	payload, _ := json.Marshal(streamDeadEvent{
		StreamID:   streamID,
		DetectedAt: time.Now().UTC(),
	})
	return b.writer.WriteMessages(ctx, kafka.Message{
		Topic: topicStreamDead,
		Key:   []byte(streamID),
		Value: payload,
	})
}
