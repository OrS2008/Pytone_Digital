package main

import (
	"context"

	"github.com/pytone/pytone/libs/go/pkg/config"
	"github.com/pytone/pytone/libs/go/pkg/logging"
	"github.com/pytone/pytone/libs/go/pkg/server"
)

// Notification service.
//
// Channels: FCM (Android, iOS, Web), APNS (iOS), WebPush (browsers),
// in-app banners (delivered over the realtime sync websocket).
//
// Triggers:
//   - favorite team's match starts in 10 min
//   - new episode of a watched series
//   - DVR recording failed
//   - new login from unrecognised device
func main() {
	log := logging.New("notification")
	ctx := logging.Into(context.Background(), log)
	if err := server.Run(ctx, server.Config{
		Service:  "notification",
		GRPCAddr: config.String("GRPC_ADDR", ":50066"),
		HTTPAddr: config.String("HTTP_ADDR", ":8080"),
	}); err != nil {
		log.Fatal().Err(err).Msg("server")
	}
}
