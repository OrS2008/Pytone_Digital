package gateway

import (
	"context"
	"net"
	"net/http"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// RateLimiter implements a token-bucket rate limiter backed by Redis.
//
// We use a Lua script that performs the token-bucket calculation atomically
// per call. This is essentially the same algorithm as Cloudflare's edge limit
// — see https://blog.cloudflare.com/ratelimiting-anything-go-tokens/.
type RateLimiter struct {
	rdb       *redis.Client
	rps       int
	burst     int
	scriptSHA string
}

const tokenBucketLua = `
local key = KEYS[1]
local now_ms = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])         -- tokens per second
local burst = tonumber(ARGV[3])         -- bucket size
local bucket = redis.call('HMGET', key, 'tokens', 'last')
local tokens = tonumber(bucket[1])
local last = tonumber(bucket[2])
if tokens == nil then
  tokens = burst
  last = now_ms
end
local delta = math.max(0, now_ms - last)
local refill = delta * rate / 1000.0
tokens = math.min(burst, tokens + refill)
local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end
redis.call('HMSET', key, 'tokens', tokens, 'last', now_ms)
redis.call('PEXPIRE', key, math.ceil(burst * 1000 / rate))
return allowed
`

// NewRateLimiter prepares the script and returns the limiter.
func NewRateLimiter(rdb *redis.Client, rps, burst int) *RateLimiter {
	if rps <= 0 {
		rps = 30
	}
	if burst <= 0 {
		burst = 60
	}
	sha, _ := rdb.ScriptLoad(context.Background(), tokenBucketLua).Result()
	return &RateLimiter{rdb: rdb, rps: rps, burst: burst, scriptSHA: sha}
}

// Wrap returns a middleware that limits requests per user (when authenticated)
// or per IP (otherwise).
func (l *RateLimiter) Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := "ratelimit:" + l.subject(r)
		allowed, err := l.allow(r.Context(), key)
		if err != nil {
			// Fail-open on Redis errors — better degraded than down.
			next.ServeHTTP(w, r)
			return
		}
		if !allowed {
			w.Header().Set("Retry-After", "1")
			http.Error(w, "rate limited", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (l *RateLimiter) subject(r *http.Request) string {
	if c, ok := ClaimsFromContext(r.Context()); ok {
		return "u:" + c.UserID
	}
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	if host == "" {
		host = r.RemoteAddr
	}
	return "ip:" + host
}

func (l *RateLimiter) allow(ctx context.Context, key string) (bool, error) {
	now := strconv.FormatInt(time.Now().UnixMilli(), 10)
	res, err := l.rdb.EvalSha(ctx, l.scriptSHA, []string{key}, now, l.rps, l.burst).Result()
	if err != nil {
		// Script flushed?  Fall back to EVAL.
		res, err = l.rdb.Eval(ctx, tokenBucketLua, []string{key}, now, l.rps, l.burst).Result()
		if err != nil {
			return false, err
		}
	}
	v, _ := res.(int64)
	return v == 1, nil
}
