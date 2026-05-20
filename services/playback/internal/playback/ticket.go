// Package playback implements the playback proxy.
//
// It exists for three reasons:
//
//  1. **Authorization.** Origin URLs are never sent to clients. Instead the
//     client gets a short-lived ticket (HMAC + Redis-tracked session). The
//     proxy validates the ticket, rewrites segment URLs, and forwards bytes.
//
//  2. **ABR steering.** When we observe rebuffering for a session, we hot-swap
//     the upstream origin without the player tearing down its session — same
//     manifest URL to the client, different origin behind the scenes. This is
//     how we deliver "AI stream failover" without restarting playback.
//
//  3. **Telemetry.** Every manifest and segment request is a QoE data point.
//     We sample (1:100 for segments, 1:1 for manifests) and tee to Kafka.
package playback

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// Ticket is an in-memory representation of a playback ticket. Identical to the
// proto, but kept here to keep this package free of generated imports.
type Ticket struct {
	ID          string
	UserID      string
	DeviceID    string
	StreamID    string
	ChannelID   string
	OriginURL   string
	IsLive      bool
	StartAt     time.Time
	ExpiresAt   time.Time
	MaxBitrate  int
}

// TicketService mints and validates tickets.
type TicketService struct {
	rdb         *redis.Client
	signingKey  []byte
	proxyOrigin string
}

// NewTicketService constructs a ticket service.
func NewTicketService(rdb *redis.Client, signingKey []byte, proxyOrigin string) *TicketService {
	return &TicketService{rdb: rdb, signingKey: signingKey, proxyOrigin: proxyOrigin}
}

// Issue produces a fresh ticket and stores its session metadata in Redis so
// subsequent segment fetches can be validated without round-tripping to the
// catalog.
func (t *TicketService) Issue(ctx context.Context, tk Ticket) (Ticket, string, error) {
	if tk.ID == "" {
		tk.ID = uuid.NewString()
	}
	if tk.ExpiresAt.IsZero() {
		tk.ExpiresAt = time.Now().Add(5 * time.Minute)
	}
	if err := t.persist(ctx, tk); err != nil {
		return Ticket{}, "", err
	}
	token := t.signToken(tk.ID, tk.ExpiresAt)
	manifestURL := fmt.Sprintf("%s/play/%s/master.m3u8?token=%s",
		t.proxyOrigin, tk.ID, url.QueryEscape(token))
	return tk, manifestURL, nil
}

// Validate parses the token, checks the HMAC, ensures the ticket has not
// expired, and returns the underlying ticket. This must be O(1) (Redis hit).
func (t *TicketService) Validate(ctx context.Context, ticketID, token string) (Ticket, error) {
	expiresAt, ok := t.verifyToken(ticketID, token)
	if !ok {
		return Ticket{}, errors.New("invalid token")
	}
	if time.Now().After(expiresAt) {
		return Ticket{}, errors.New("token expired")
	}
	return t.load(ctx, ticketID)
}

// SwapOrigin atomically updates the origin URL associated with a ticket. The
// AI playback supervisor calls this when it decides to fail a session over.
func (t *TicketService) SwapOrigin(ctx context.Context, ticketID, newOrigin string) error {
	return t.rdb.HSet(ctx, ticketKey(ticketID), "origin_url", newOrigin).Err()
}

// --- internals --------------------------------------------------------------

func (t *TicketService) persist(ctx context.Context, tk Ticket) error {
	key := ticketKey(tk.ID)
	pipe := t.rdb.TxPipeline()
	pipe.HSet(ctx, key, map[string]any{
		"user_id":     tk.UserID,
		"device_id":   tk.DeviceID,
		"stream_id":   tk.StreamID,
		"channel_id":  tk.ChannelID,
		"origin_url":  tk.OriginURL,
		"is_live":     tk.IsLive,
		"start_at":    tk.StartAt.UnixNano(),
		"max_bitrate": tk.MaxBitrate,
	})
	pipe.ExpireAt(ctx, key, tk.ExpiresAt.Add(30*time.Second))
	_, err := pipe.Exec(ctx)
	return err
}

func (t *TicketService) load(ctx context.Context, ticketID string) (Ticket, error) {
	vals, err := t.rdb.HGetAll(ctx, ticketKey(ticketID)).Result()
	if err != nil {
		return Ticket{}, err
	}
	if len(vals) == 0 {
		return Ticket{}, errors.New("ticket not found")
	}
	tk := Ticket{
		ID:        ticketID,
		UserID:    vals["user_id"],
		DeviceID:  vals["device_id"],
		StreamID:  vals["stream_id"],
		ChannelID: vals["channel_id"],
		OriginURL: vals["origin_url"],
	}
	tk.IsLive, _ = strconv.ParseBool(vals["is_live"])
	if v, err := strconv.ParseInt(vals["start_at"], 10, 64); err == nil && v != 0 {
		tk.StartAt = time.Unix(0, v)
	}
	tk.MaxBitrate, _ = strconv.Atoi(vals["max_bitrate"])
	return tk, nil
}

func ticketKey(id string) string { return "play:ticket:" + id }

// signToken produces base64(expiresUnix || hmac(signingKey, ticketID || expires)).
// Compact, deterministic, and verifiable without a DB hit.
func (t *TicketService) signToken(ticketID string, expiresAt time.Time) string {
	expSec := expiresAt.Unix()
	mac := hmac.New(sha256.New, t.signingKey)
	mac.Write([]byte(ticketID))
	var expBytes [8]byte
	binary.BigEndian.PutUint64(expBytes[:], uint64(expSec))
	mac.Write(expBytes[:])
	sig := mac.Sum(nil)
	out := make([]byte, 8+len(sig))
	copy(out[:8], expBytes[:])
	copy(out[8:], sig)
	return base64.RawURLEncoding.EncodeToString(out)
}

func (t *TicketService) verifyToken(ticketID, token string) (time.Time, bool) {
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil || len(raw) < 9 {
		return time.Time{}, false
	}
	expSec := int64(binary.BigEndian.Uint64(raw[:8]))
	wantSig := raw[8:]
	mac := hmac.New(sha256.New, t.signingKey)
	mac.Write([]byte(ticketID))
	mac.Write(raw[:8])
	if !hmac.Equal(mac.Sum(nil), wantSig) {
		return time.Time{}, false
	}
	return time.Unix(expSec, 0), true
}
