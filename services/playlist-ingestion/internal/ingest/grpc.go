package ingest

import (
	"context"

	"google.golang.org/grpc"
)

// registerGRPC binds the service's gRPC API. In a fully wired build this would
// register the generated PlaylistServiceServer (see libs/proto). For
// readability and to keep this scaffold compiling without `buf generate`
// having run, we expose the same shape via an interface we control here.
//
// When the proto codegen pipeline runs (`buf generate`), this file is replaced
// by the generated registration code; the methods below match the proto
// signatures one-to-one.
type GRPCHandlers struct {
	svc *Service
}

func registerGRPC(g *grpc.Server, svc *Service) {
	_ = g
	_ = &GRPCHandlers{svc: svc}
	// playlistv1.RegisterPlaylistServiceServer(g, &GRPCHandlers{svc: svc})
}

// TriggerRefresh — exposed for direct invocation (eg the scheduler worker).
func (h *GRPCHandlers) TriggerRefresh(ctx context.Context, sourceID string) (string, error) {
	return h.svc.Refresh(ctx, sourceID)
}
