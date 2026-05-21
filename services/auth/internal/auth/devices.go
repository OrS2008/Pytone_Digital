package auth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
)

// DeviceManager enforces the concurrent-device limit dictated by the user's
// plan:
//
//   - Plan "single":  1 active device
//   - Plan "multi":   up to 4 active devices
//
// A "device" is a (userID, deviceID) pair. The deviceID is generated client-
// side at install time and persisted (Hive on Flutter, localStorage on web,
// keychain on iOS, EncryptedSharedPreferences on Android, webOS device id on
// LG TV). It survives logout but not app reinstall — which is the right
// behaviour: reinstalling on the same TV shouldn't burn a slot if the user
// also logged out of the old install.
//
// The slot is held in Redis with a TTL equal to the playback ticket's TTL,
// refreshed on every heartbeat. If a device goes silent, its slot frees
// automatically — no need to depend on the client calling Logout.
type DeviceManager struct {
	rdb *redis.Client
}

// NewDeviceManager wires the manager.
func NewDeviceManager(rdb *redis.Client) *DeviceManager {
	return &DeviceManager{rdb: rdb}
}

// ErrDeviceLimitReached is returned by Acquire when the user is already
// streaming from `max` devices.
var ErrDeviceLimitReached = errors.New("device limit reached for current plan")

// Acquire reserves a device slot for (userID, deviceID). If the slot is
// already held by this device, the TTL is refreshed and we return nil. If the
// user is at the limit and this device is not among the holders, we return
// ErrDeviceLimitReached and the caller can offer the user the option to kick
// another device.
func (m *DeviceManager) Acquire(ctx context.Context, userID, deviceID, label string, max int, ttl time.Duration) error {
	if max <= 0 {
		max = 1
	}
	key := slotsKey(userID)
	now := time.Now().UnixMilli()
	cutoff := time.Now().Add(-ttl).UnixMilli()

	// Run inside an optimistic transaction so the WATCH catches a race
	// between "count" and "add".
	return m.rdb.Watch(ctx, func(tx *redis.Tx) error {
		// Drop stale heartbeats first.
		_ = tx.ZRemRangeByScore(ctx, key, "-inf", float64ToString(cutoff)).Err()

		score, err := tx.ZScore(ctx, key, deviceID).Result()
		alreadyHolding := err == nil && score > 0

		if !alreadyHolding {
			n, err := tx.ZCard(ctx, key).Result()
			if err != nil {
				return err
			}
			if int(n) >= max {
				return ErrDeviceLimitReached
			}
		}

		_, err = tx.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
			pipe.ZAdd(ctx, key, redis.Z{Score: float64(now), Member: deviceID})
			pipe.HSet(ctx, labelsKey(userID), deviceID, label)
			pipe.Expire(ctx, key, ttl*2)
			pipe.Expire(ctx, labelsKey(userID), ttl*2)
			return nil
		})
		return err
	}, key)
}

// Release frees a slot — called on explicit logout.
func (m *DeviceManager) Release(ctx context.Context, userID, deviceID string) error {
	pipe := m.rdb.TxPipeline()
	pipe.ZRem(ctx, slotsKey(userID), deviceID)
	pipe.HDel(ctx, labelsKey(userID), deviceID)
	_, err := pipe.Exec(ctx)
	return err
}

// Heartbeat refreshes the slot TTL. The playback service calls this on each
// QoE sample so an active stream keeps the slot warm.
func (m *DeviceManager) Heartbeat(ctx context.Context, userID, deviceID string, ttl time.Duration) error {
	score := time.Now().UnixMilli()
	added, err := m.rdb.ZAddXX(ctx, slotsKey(userID),
		redis.Z{Score: float64(score), Member: deviceID}).Result()
	if err != nil {
		return err
	}
	if added == 0 {
		// Slot was freed under us (e.g. another device kicked us). Refuse so
		// the player tears down and the user sees the kick.
		return ErrDeviceLimitReached
	}
	_ = m.rdb.Expire(ctx, slotsKey(userID), ttl*2).Err()
	return nil
}

// ActiveDevices returns labels of currently-active devices, sorted by
// most-recently-active first. Used by the "manage devices" UI so the user can
// see what's connected and kick something to free a slot.
type DeviceSlot struct {
	DeviceID string
	Label    string
	LastSeen time.Time
}

func (m *DeviceManager) ActiveDevices(ctx context.Context, userID string) ([]DeviceSlot, error) {
	zs, err := m.rdb.ZRevRangeWithScores(ctx, slotsKey(userID), 0, -1).Result()
	if err != nil {
		return nil, err
	}
	labels, _ := m.rdb.HGetAll(ctx, labelsKey(userID)).Result()
	out := make([]DeviceSlot, 0, len(zs))
	for _, z := range zs {
		id, _ := z.Member.(string)
		out = append(out, DeviceSlot{
			DeviceID: id,
			Label:    labels[id],
			LastSeen: time.UnixMilli(int64(z.Score)),
		})
	}
	return out, nil
}

func slotsKey(userID string) string {
	// Hashed so a Redis breach doesn't leak the user id set.
	h := sha256.Sum256([]byte(userID))
	return "auth:devs:" + base64.RawURLEncoding.EncodeToString(h[:12])
}
func labelsKey(userID string) string { return slotsKey(userID) + ":lbl" }

func float64ToString(n int64) string {
	// minimal int → string for ZRemRangeByScore (we want exact-int, not float)
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	buf := make([]byte, 0, 20)
	for n > 0 {
		buf = append(buf, byte(n%10)+'0')
		n /= 10
	}
	if neg {
		buf = append(buf, '-')
	}
	for i, j := 0, len(buf)-1; i < j; i, j = i+1, j-1 {
		buf[i], buf[j] = buf[j], buf[i]
	}
	return string(buf)
}
