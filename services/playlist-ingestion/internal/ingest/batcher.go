package ingest

import (
	"context"

	"github.com/cespare/xxhash/v2"
	"github.com/google/uuid"

	"github.com/pytone/pytone/libs/go/pkg/m3u"
)

// batcher accumulates parsed M3U entries and flushes them to the store in
// fixed-size batches. It deliberately holds no goroutines or channels: it is
// invoked from a single ingestion goroutine and synchronously flushes.
type batcher struct {
	store    Store
	sourceID string
	limit    int
	buf      []ChannelRow
	count    int
}

func newBatcher(store Store, sourceID string, limit int) *batcher {
	if limit <= 0 {
		limit = 250
	}
	return &batcher{store: store, sourceID: sourceID, limit: limit, buf: make([]ChannelRow, 0, limit)}
}

// Add converts an Entry into a row and appends to the buffer.
func (b *batcher) Add(e m3u.Entry) {
	row := ChannelRow{
		ChannelID:     deterministicID(b.sourceID, e.TvgID, e.Name),
		StreamID:      uuid.NewString(),
		Name:          e.Name,
		DisplayName:   firstNonEmpty(e.TvgName, e.Name),
		LogoURL:       e.Logo,
		Categories:    splitCategories(e.Group),
		Country:       e.Country,
		Language:      e.Language,
		EPGID:         e.TvgID,
		ChannelNumber: e.ChannelNumber,
		URL:           e.URL,
		URLHash:       xxhash.Sum64String(e.URL),
		Headers:       e.Headers,
		Catchup:       e.Catchup,
		CatchupDays:   e.CatchupDays,
		CatchupTpl:    e.CatchupSource,
	}
	b.buf = append(b.buf, row)
	b.count++
}

// Full reports whether the buffer has reached its flush threshold.
func (b *batcher) Full() bool { return len(b.buf) >= b.limit }

// Count returns the total number of rows added across all flushes.
func (b *batcher) Count() int { return b.count }

// Flush writes the current batch to the store.
func (b *batcher) Flush(ctx context.Context) error {
	if len(b.buf) == 0 {
		return nil
	}
	if err := b.store.UpsertChannelBatch(ctx, b.sourceID, b.buf); err != nil {
		return err
	}
	b.buf = b.buf[:0]
	return nil
}

// deterministicID produces a stable UUIDv5 from (source, tvgID, name) so that
// repeated refreshes don't churn the channel catalog.
func deterministicID(sourceID, tvgID, name string) string {
	seed := sourceID + "|" + tvgID + "|" + name
	return uuid.NewSHA1(uuid.NameSpaceOID, []byte(seed)).String()
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

// splitCategories splits a group title on common delimiters (` | `, ` / `, `;`)
// so providers' compound group names like "UK | Entertainment" become
// {"UK", "Entertainment"}.
func splitCategories(group string) []string {
	if group == "" {
		return nil
	}
	out := []string{group}
	for _, delim := range []string{" | ", " / ", ";"} {
		next := make([]string, 0, len(out)*2)
		for _, s := range out {
			for _, p := range splitOn(s, delim) {
				if p != "" {
					next = append(next, p)
				}
			}
		}
		out = next
	}
	return out
}

func splitOn(s, sep string) []string {
	if s == "" {
		return nil
	}
	var out []string
	for {
		i := indexOf(s, sep)
		if i < 0 {
			out = append(out, trim(s))
			return out
		}
		out = append(out, trim(s[:i]))
		s = s[i+len(sep):]
	}
}

func indexOf(s, sub string) int {
	if len(sub) == 0 {
		return 0
	}
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

func trim(s string) string {
	start, end := 0, len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t') {
		end--
	}
	return s[start:end]
}
