// Recording worker.
//
// Each instance claims a subset of "recordable" channels from the recording
// coordinator. For each claimed channel it runs a goroutine that continuously
// fetches the live HLS manifest and copies each new segment into object
// storage with a deterministic, content-addressed layout:
//
//   dvr/{channel_id}/{yyyy}/{mm}/{dd}/{hh}/{epoch_ms}-{seq}-{duration_ms}.ts
//
// A separate index row is written to Postgres for each segment so the manifest
// builder (in the dvr service) can produce VOD-style HLS for any window in
// the retention period in O(1) lookups.
//
// 14-day rolling retention is implemented by the retention sweeper, which
// runs on a schedule, lists segments older than `now - retention` for each
// channel, deletes them in object storage, and removes the index rows.
package main

import (
	"context"

	"github.com/pytone/pytone/libs/go/pkg/config"
	"github.com/pytone/pytone/libs/go/pkg/logging"
	"github.com/pytone/pytone/libs/go/pkg/server"
	"github.com/pytone/pytone/services/recording/internal/recorder"
)

func main() {
	log := logging.New("recording")
	ctx := logging.Into(context.Background(), log)

	deps, err := recorder.Wire(ctx, recorder.Config{
		DatabaseURL:    config.MustString("DATABASE_URL"),
		RedisURL:       config.MustString("REDIS_URL"),
		KafkaBrokers:   config.CSV("KAFKA_BROKERS"),
		S3Endpoint:     config.MustString("S3_ENDPOINT"),
		S3Region:       config.String("S3_REGION", "us-east-1"),
		S3Bucket:       config.MustString("S3_BUCKET"),
		WorkerID:       config.MustString("WORKER_ID"),
		MaxChannels:    config.Int("MAX_CHANNELS", 64),
		Retention:      config.Duration("RETENTION", 0),
		PlaylistGRPC:   config.MustString("PLAYLIST_GRPC_ADDR"),
		PlaybackGRPC:   config.String("PLAYBACK_GRPC_ADDR", ""),
	})
	if err != nil {
		log.Fatal().Err(err).Msg("wire")
	}
	defer deps.Close()

	go deps.Recorder.Run(ctx)
	go deps.RetentionSweeper.Run(ctx)

	if err := server.Run(ctx, server.Config{
		Service:  "recording",
		GRPCAddr: config.String("GRPC_ADDR", ":50054"),
		HTTPAddr: config.String("HTTP_ADDR", ":8080"),
	}); err != nil {
		log.Fatal().Err(err).Msg("server")
	}
}
