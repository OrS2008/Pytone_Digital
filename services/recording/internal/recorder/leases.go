package recorder

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

// LeaseManager coordinates which worker records which channel.
//
// We use Redis as a coordination point because k8s already manages process
// lifecycles — we just need to ensure that each channel has *exactly one*
// recorder at any moment. The pattern:
//
//   - The list of recordable channels lives in `dvr:recordable` (a Redis set).
//   - Each lease lives in `dvr:lease:{channel_id}` -> worker_id, with a TTL.
//   - On every refresh, each worker tries to acquire as many leases as it has
//     headroom for (MaxChannels - currently_held). Acquisition is SET NX EX.
//   - Held leases are renewed on the same call.
//
// This is dramatically simpler than a centralized scheduler and tolerates
// worker churn (a crashed worker's leases expire within 30s).
type LeaseManager struct {
	rdb         *redis.Client
	workerID    string
	maxChannels int
	leaseTTL    time.Duration
}

// RecordableChannel is everything the recorder needs to begin recording.
type RecordableChannel struct {
	ID        string
	OriginURL string
}

// NewLeaseManager wires the manager.
func NewLeaseManager(rdb *redis.Client, workerID string, maxChannels int) *LeaseManager {
	return &LeaseManager{
		rdb:         rdb,
		workerID:    workerID,
		maxChannels: maxChannels,
		leaseTTL:    30 * time.Second,
	}
}

const (
	recordableSetKey = "dvr:recordable"
	channelHashKey   = "dvr:channel:" // + channel_id
)

func leaseKey(channelID string) string { return "dvr:lease:" + channelID }

// Refresh renews held leases and acquires new ones up to maxChannels.
func (l *LeaseManager) Refresh(ctx context.Context) ([]RecordableChannel, error) {
	candidates, err := l.rdb.SMembers(ctx, recordableSetKey).Result()
	if err != nil {
		return nil, err
	}

	held := make([]string, 0, l.maxChannels)
	for _, ch := range candidates {
		ok, err := l.rdb.SetArgs(ctx, leaseKey(ch), l.workerID, redis.SetArgs{
			Mode: "XX",
			TTL:  l.leaseTTL,
		}).Result()
		if err == nil && ok == "OK" {
			held = append(held, ch)
		}
	}

	// Acquire up to MaxChannels.
	for _, ch := range candidates {
		if len(held) >= l.maxChannels {
			break
		}
		// already held?
		if contains(held, ch) {
			continue
		}
		ok, err := l.rdb.SetArgs(ctx, leaseKey(ch), l.workerID, redis.SetArgs{
			Mode: "NX",
			TTL:  l.leaseTTL,
		}).Result()
		if err == nil && ok == "OK" {
			held = append(held, ch)
		}
	}

	out := make([]RecordableChannel, 0, len(held))
	for _, ch := range held {
		originURL, err := l.rdb.HGet(ctx, channelHashKey+ch, "origin_url").Result()
		if err != nil {
			continue
		}
		out = append(out, RecordableChannel{ID: ch, OriginURL: originURL})
	}
	return out, nil
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}
