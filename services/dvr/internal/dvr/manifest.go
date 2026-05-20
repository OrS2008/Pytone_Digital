// Package dvr serves catch-up and recording manifests.
//
// A "catch-up manifest" is a VOD-style HLS playlist that points at the
// segments that were live-recorded for a given (channel, time-window). We
// build it on demand from the dvr_segments index:
//
//   #EXTM3U
//   #EXT-X-VERSION:3
//   #EXT-X-TARGETDURATION:6
//   #EXT-X-MEDIA-SEQUENCE:0
//   #EXT-X-PLAYLIST-TYPE:VOD
//   #EXTINF:5.984,
//   {s3-public-url}/dvr/{channel}/.../seg.ts
//   ...
//   #EXT-X-ENDLIST
//
// Segment URLs are signed: each query-string carries an HMAC keyed on
// (start, expiry, user_id). The CDN edge validates the signature without
// hitting the catalog. This is how Plex / CloudFlare R2 / Mux protect VOD.
package dvr

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ManifestBuilder produces signed catch-up manifests.
type ManifestBuilder struct {
	pool      *pgxpool.Pool
	publicURL string // e.g. https://dvr-cdn.pytone.tv
	signKey   []byte
}

// NewManifestBuilder wires the builder.
func NewManifestBuilder(pool *pgxpool.Pool, publicURL string, signKey []byte) *ManifestBuilder {
	return &ManifestBuilder{pool: pool, publicURL: strings.TrimRight(publicURL, "/"), signKey: signKey}
}

type segmentInfo struct {
	startedAt  time.Time
	durationMs int
	objectKey  string
}

// Build returns the manifest body for the requested window.
func (m *ManifestBuilder) Build(ctx context.Context, channelID string, from, to time.Time, viewer string) (string, error) {
	if !to.After(from) {
		return "", errors.New("invalid window")
	}
	if to.Sub(from) > 24*time.Hour {
		return "", errors.New("window too large")
	}

	const q = `
		SELECT started_at, duration_ms, object_key
		  FROM dvr_segments
		 WHERE channel_id = $1
		   AND started_at >= $2
		   AND started_at < $3
		 ORDER BY started_at`
	rows, err := m.pool.Query(ctx, q, channelID, from, to)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var segs []segmentInfo
	maxDur := 0
	for rows.Next() {
		var s segmentInfo
		if err := rows.Scan(&s.startedAt, &s.durationMs, &s.objectKey); err != nil {
			return "", err
		}
		segs = append(segs, s)
		if s.durationMs > maxDur {
			maxDur = s.durationMs
		}
	}
	if err := rows.Err(); err != nil {
		return "", err
	}
	if len(segs) == 0 {
		return "", errors.New("no segments in window")
	}

	expiry := time.Now().Add(2 * time.Hour).Unix()
	var b bytes.Buffer
	fmt.Fprintln(&b, "#EXTM3U")
	fmt.Fprintln(&b, "#EXT-X-VERSION:3")
	fmt.Fprintf(&b, "#EXT-X-TARGETDURATION:%d\n", (maxDur+999)/1000)
	fmt.Fprintln(&b, "#EXT-X-MEDIA-SEQUENCE:0")
	fmt.Fprintln(&b, "#EXT-X-PLAYLIST-TYPE:VOD")
	for _, s := range segs {
		fmt.Fprintf(&b, "#EXTINF:%.3f,\n", float64(s.durationMs)/1000)
		token := m.signSegmentURL(s.objectKey, viewer, expiry)
		fmt.Fprintf(&b, "%s/%s?vex=%d&vt=%s\n", m.publicURL, s.objectKey, expiry, token)
	}
	fmt.Fprintln(&b, "#EXT-X-ENDLIST")
	return b.String(), nil
}

func (m *ManifestBuilder) signSegmentURL(objectKey, viewer string, expiry int64) string {
	mac := hmac.New(sha256.New, m.signKey)
	mac.Write([]byte(objectKey))
	mac.Write([]byte{0})
	mac.Write([]byte(viewer))
	mac.Write([]byte{0})
	mac.Write([]byte(strconv.FormatInt(expiry, 10)))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
