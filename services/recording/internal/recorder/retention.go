package recorder

import (
	"context"
	"time"

	"github.com/pytone/pytone/libs/go/pkg/logging"
)

// RetentionSweeper enforces the 14-day rolling window by deleting segments
// older than the retention period from both object storage and the index.
//
// It runs hourly. Each pass processes up to 5000 segments to keep memory
// bounded; if there's more, the next pass picks them up. Deletions go to
// object storage first, then the DB row — if the DB delete fails we retry on
// the next pass and the object delete is idempotent.
type RetentionSweeper struct {
	store     Store
	storage   Storage
	retention time.Duration
}

// NewRetentionSweeper wires the sweeper.
func NewRetentionSweeper(store Store, storage Storage, retention time.Duration) *RetentionSweeper {
	return &RetentionSweeper{store: store, storage: storage, retention: retention}
}

// Run loops until ctx is cancelled.
func (s *RetentionSweeper) Run(ctx context.Context) {
	log := logging.From(ctx)
	t := time.NewTicker(time.Hour)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		if err := s.runOnce(ctx); err != nil {
			log.Warn().Err(err).Msg("retention pass failed")
		}
	}
}

func (s *RetentionSweeper) runOnce(ctx context.Context) error {
	cutoff := time.Now().Add(-s.retention)
	rows, err := s.store.ListSegmentsForRetention(ctx, cutoff, 5000)
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		return nil
	}
	ids := make([]int64, 0, len(rows))
	for _, r := range rows {
		if err := s.storage.Delete(ctx, r.ObjectKey); err != nil {
			// Skip this id; we'll retry next pass.
			continue
		}
		ids = append(ids, r.ID)
	}
	return s.store.DeleteSegments(ctx, ids)
}
