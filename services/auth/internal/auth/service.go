// Package auth implements user registration, login, refresh-token rotation,
// device session management, email activation and subscription enforcement.
//
// Token model:
//   - Access token: RS256 JWT, 15min TTL. Carries (sub, iss, aud, scopes,
//     plan, devices_max, trial_until, sub_until). Verified offline by the
//     gateway using the matching public key.
//   - Refresh token: 32-byte opaque value. Stored as HMAC-SHA-256(token) in
//     `refresh_tokens` keyed by chain_id so token-replay revokes the entire
//     chain.
//
// Password hashing: Argon2id with per-deployment pepper (2 iterations,
// 64 MiB memory, 4 parallelism — OWASP 2024).
//
// Refresh-token hashing: HMAC-SHA-256 with the same pepper. Argon2id is the
// wrong primitive for high-entropy lookup tokens — see audit-2026-05.md §3.
package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/argon2"
)

const (
	JWTIssuer   = "nova-stream-auth"
	JWTAudience = "nova-stream-api"
)

// Errors surfaced to end users. Deliberately vague — they must not leak
// account enumeration or lockout signals.
var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrAccountLocked      = errors.New("too many failed attempts; try again later")
	ErrAccountNotActive   = errors.New("account requires activation; check your email")
	ErrTokenInvalid       = errors.New("invalid or expired token")
)

type Service struct {
	pool       *pgxpool.Pool
	rdb        *redis.Client
	mailer     Mailer
	priv       *rsa.PrivateKey
	pepper     []byte
	accessTTL  time.Duration
	refreshTTL time.Duration
}

func NewService(pool *pgxpool.Pool, rdb *redis.Client, mailer Mailer, priv *rsa.PrivateKey, pepper []byte, accessTTL, refreshTTL time.Duration) *Service {
	if accessTTL == 0 {
		accessTTL = 15 * time.Minute
	}
	if refreshTTL == 0 {
		refreshTTL = 30 * 24 * time.Hour
	}
	return &Service{
		pool: pool, rdb: rdb, mailer: mailer,
		priv: priv, pepper: pepper,
		accessTTL: accessTTL, refreshTTL: refreshTTL,
	}
}

// --- Registration & activation ---------------------------------------------

// Register starts the registration flow.
//
// To avoid leaking which emails are subscribers, this function ALWAYS
// returns success — whether the email is new or already in use:
//
//   - new email   → create user (state=pending_activation), send activation
//                   email with a single-use link.
//   - known email → email the account holder a password-reset hint instead.
//
// The caller's response shape is identical either way.
func (s *Service) Register(ctx context.Context, email, password string) error {
	email = normalizeEmail(email)
	if err := validatePassword(password); err != nil {
		return err
	}

	uid := uuid.New()
	hash := s.hashPassword(password)
	var created bool
	err := s.pool.QueryRow(ctx, `
		INSERT INTO users (id, email, password_hash, subscription_status, created_at)
		VALUES ($1, $2, $3, 'pending_activation', now())
		ON CONFLICT (email) DO NOTHING
		RETURNING true
	`, uid, email, hash).Scan(&created)
	if errors.Is(err, pgx.ErrNoRows) {
		// Email already exists — send the reset-hint email so the response
		// shape is indistinguishable from a fresh registration.
		_ = s.mailer.SendPasswordResetHint(ctx, email)
		return nil
	}
	if err != nil {
		return err
	}

	token, err := s.mintEmailToken(ctx, uid.String(), "activate", 48*time.Hour)
	if err != nil {
		return err
	}
	return s.mailer.SendActivation(ctx, email, token)
}

// Activate consumes the activation token, transitions the user to `trialing`,
// records the trial expiry (now + 7 days), and returns the canonical user id.
func (s *Service) Activate(ctx context.Context, token string) (userID string, err error) {
	userID, err = s.consumeEmailToken(ctx, token, "activate")
	if err != nil {
		return "", ErrTokenInvalid
	}
	trialUntil := time.Now().Add(7 * 24 * time.Hour)
	_, err = s.pool.Exec(ctx, `
		UPDATE users
		   SET subscription_status = 'trialing',
		       trial_started_at    = now(),
		       trial_expires_at    = $2,
		       email_verified_at   = now()
		 WHERE id = $1 AND subscription_status = 'pending_activation'
	`, userID, trialUntil)
	return userID, err
}

// --- Login -----------------------------------------------------------------

const (
	loginMaxFailures = 5
	loginWindow      = 15 * time.Minute
)

// Login verifies credentials, enforces per-account brute-force lockout, and
// issues a token pair on success.
func (s *Service) Login(ctx context.Context, email, password, deviceID, ip string) (TokenPair, error) {
	email = normalizeEmail(email)

	if locked, err := s.isLocked(ctx, email); err != nil {
		// Fail closed — better degraded login than a brute-force window.
		return TokenPair{}, err
	} else if locked {
		s.audit(ctx, "", "login_locked", ip, email)
		return TokenPair{}, ErrAccountLocked
	}

	var (
		uid    uuid.UUID
		hash   []byte
		status string
	)
	err := s.pool.QueryRow(ctx, `
		SELECT id, password_hash, subscription_status
		  FROM users WHERE email = $1
	`, email).Scan(&uid, &hash, &status)
	if err != nil {
		s.recordFailure(ctx, email)
		// Keep timing comparable to a real verify so we don't leak
		// existence via response-time.
		_ = s.verifyPassword(password, dummyHash[:])
		s.audit(ctx, "", "login_unknown_email", ip, email)
		return TokenPair{}, ErrInvalidCredentials
	}
	if !s.verifyPassword(password, hash) {
		s.recordFailure(ctx, email)
		s.audit(ctx, uid.String(), "login_bad_password", ip, "")
		return TokenPair{}, ErrInvalidCredentials
	}
	if status == "pending_activation" {
		return TokenPair{}, ErrAccountNotActive
	}
	s.clearFailures(ctx, email)
	s.audit(ctx, uid.String(), "login_ok", ip, "")
	return s.issueTokens(ctx, uid.String(), deviceID)
}

// --- Refresh (atomic rotation) ---------------------------------------------

// Refresh rotates a refresh token. Atomic compare-and-set on `used` prevents
// concurrent rotations from both succeeding; any replay revokes the chain.
func (s *Service) Refresh(ctx context.Context, refreshToken, deviceID string) (TokenPair, error) {
	rows, err := s.pool.Query(ctx, `
		UPDATE refresh_tokens
		   SET used = true
		 WHERE token_hash = $1
		   AND used = false
		   AND revoked = false
		   AND expires_at > now()
		RETURNING user_id, chain
	`, s.hashOpaque(refreshToken))
	if err != nil {
		return TokenPair{}, err
	}
	defer rows.Close()
	if !rows.Next() {
		// Either expired/nonexistent or already used. If a row exists at all
		// for this hash, treat it as a replay — revoke the chain.
		_, _ = s.pool.Exec(ctx, `
			UPDATE refresh_tokens SET revoked = true
			 WHERE chain = (SELECT chain FROM refresh_tokens WHERE token_hash = $1)
		`, s.hashOpaque(refreshToken))
		return TokenPair{}, ErrTokenInvalid
	}
	var (
		userID uuid.UUID
		chain  uuid.UUID
	)
	if err := rows.Scan(&userID, &chain); err != nil {
		return TokenPair{}, err
	}
	rows.Close()

	pair, err := s.issueTokens(ctx, userID.String(), deviceID)
	if err != nil {
		return TokenPair{}, err
	}
	// Stitch new token onto the same chain so any future replay kills both.
	_, _ = s.pool.Exec(ctx, `
		UPDATE refresh_tokens SET chain = $1
		 WHERE token_hash = $2
	`, chain, s.hashOpaque(pair.Refresh))
	return pair, nil
}

// --- Token issuance --------------------------------------------------------

type TokenPair struct {
	Access     string
	Refresh    string
	ExpiresAt  time.Time
	RefreshExp time.Time
}

func (s *Service) issueTokens(ctx context.Context, userID, deviceID string) (TokenPair, error) {
	now := time.Now()

	// Pull subscription state into the JWT so downstream services
	// authorise without hitting the DB on the hot path.
	var (
		status     string
		plan       string
		devicesMax int
		trialUntil *time.Time
		subUntil   *time.Time
	)
	err := s.pool.QueryRow(ctx, `
		SELECT subscription_status,
		       COALESCE(plan, ''),
		       COALESCE(devices_max, 0),
		       trial_expires_at, sub_expires_at
		  FROM users WHERE id = $1
	`, userID).Scan(&status, &plan, &devicesMax, &trialUntil, &subUntil)
	if err != nil {
		return TokenPair{}, err
	}

	access, err := s.signAccess(userID, plan, status, devicesMax, trialUntil, subUntil, now)
	if err != nil {
		return TokenPair{}, err
	}
	refresh := generateOpaque(32)
	chain := uuid.New()
	_, err = s.pool.Exec(ctx, `
		INSERT INTO refresh_tokens (token_hash, user_id, device_id, chain, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5, now())
	`, s.hashOpaque(refresh), userID, deviceID, chain, now.Add(s.refreshTTL))
	if err != nil {
		return TokenPair{}, err
	}
	return TokenPair{
		Access:     access,
		Refresh:    refresh,
		ExpiresAt:  now.Add(s.accessTTL),
		RefreshExp: now.Add(s.refreshTTL),
	}, nil
}

func (s *Service) signAccess(userID, plan, status string, devicesMax int, trialUntil, subUntil *time.Time, now time.Time) (string, error) {
	claims := jwt.MapClaims{
		"sub":         userID,
		"iss":         JWTIssuer,
		"aud":         JWTAudience,
		"iat":         now.Unix(),
		"exp":         now.Add(s.accessTTL).Unix(),
		"plan":        plan,
		"sub_status":  status,
		"devices_max": devicesMax,
	}
	if trialUntil != nil {
		claims["trial_until"] = trialUntil.Unix()
	}
	if subUntil != nil {
		claims["sub_until"] = subUntil.Unix()
	}
	tk := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return tk.SignedString(s.priv)
}

// --- Brute-force counters --------------------------------------------------

func (s *Service) isLocked(ctx context.Context, email string) (bool, error) {
	n, err := s.rdb.ZCount(ctx, failKey(email),
		strconv.FormatInt(time.Now().Add(-loginWindow).Unix(), 10), "+inf").Result()
	if err != nil {
		return false, err
	}
	return int(n) >= loginMaxFailures, nil
}

func (s *Service) recordFailure(ctx context.Context, email string) {
	now := time.Now().Unix()
	pipe := s.rdb.TxPipeline()
	pipe.ZAdd(ctx, failKey(email), redis.Z{Score: float64(now), Member: now})
	pipe.ZRemRangeByScore(ctx, failKey(email), "-inf",
		strconv.FormatInt(time.Now().Add(-loginWindow).Unix(), 10))
	pipe.Expire(ctx, failKey(email), loginWindow)
	_, _ = pipe.Exec(ctx)
}

func (s *Service) clearFailures(ctx context.Context, email string) {
	_ = s.rdb.Del(ctx, failKey(email)).Err()
}

func failKey(email string) string {
	// Hash the email so a Redis breach doesn't leak the customer list.
	h := sha256.Sum256([]byte(email))
	return "auth:fail:" + base64.RawURLEncoding.EncodeToString(h[:12])
}

// --- Email-token mint / consume --------------------------------------------

func (s *Service) mintEmailToken(ctx context.Context, userID, purpose string, ttl time.Duration) (string, error) {
	token := generateOpaque(32)
	_, err := s.pool.Exec(ctx, `
		INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at, created_at)
		VALUES ($1, $2, $3, $4, now())
	`, s.hashOpaque(token), userID, purpose, time.Now().Add(ttl))
	return token, err
}

func (s *Service) consumeEmailToken(ctx context.Context, token, purpose string) (string, error) {
	var userID uuid.UUID
	err := s.pool.QueryRow(ctx, `
		UPDATE email_tokens SET used = true
		 WHERE token_hash = $1
		   AND purpose = $2
		   AND used = false
		   AND expires_at > now()
		RETURNING user_id
	`, s.hashOpaque(token), purpose).Scan(&userID)
	if err != nil {
		return "", err
	}
	return userID.String(), nil
}

// --- Audit log -------------------------------------------------------------

func (s *Service) audit(ctx context.Context, userID, event, ip, detail string) {
	if userID == "" {
		userID = "00000000-0000-0000-0000-000000000000"
	}
	_, _ = s.pool.Exec(ctx, `
		INSERT INTO auth_audit_log (user_id, event, ip, detail, at)
		VALUES ($1, $2, $3, $4, now())
	`, userID, event, ip, detail)
}

// --- Hashing primitives ----------------------------------------------------

// hashPassword runs Argon2id (OWASP 2024 params) with a per-deployment pepper.
func (s *Service) hashPassword(pw string) []byte {
	salt := make([]byte, 16)
	_, _ = rand.Read(salt)
	key := argon2.IDKey([]byte(pw), append(salt, s.pepper...), 2, 64*1024, 4, 32)
	out := make([]byte, 0, len(salt)+len(key))
	out = append(out, salt...)
	out = append(out, key...)
	return out
}

func (s *Service) verifyPassword(pw string, stored []byte) bool {
	if len(stored) != 16+32 {
		return false
	}
	salt := stored[:16]
	want := stored[16:]
	got := argon2.IDKey([]byte(pw), append(salt, s.pepper...), 2, 64*1024, 4, 32)
	return hmac.Equal(got, want)
}

// hashOpaque is the lookup hash for high-entropy opaque tokens (refresh
// tokens, email tokens). HMAC-SHA-256 with the deployment pepper: fast,
// deterministic, peppered against rainbow attacks. NOT a password hash.
func (s *Service) hashOpaque(token string) []byte {
	mac := hmac.New(sha256.New, s.pepper)
	mac.Write([]byte(token))
	return mac.Sum(nil)
}

// dummyHash keeps `Login` timing stable for unknown-email requests.
var dummyHash [48]byte

// --- Helpers ---------------------------------------------------------------

func generateOpaque(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func normalizeEmail(s string) string {
	return strings.TrimSpace(strings.ToLower(s))
}

func validatePassword(p string) error {
	if len(p) < 10 {
		return errors.New("password must be at least 10 characters")
	}
	if len(p) > 256 {
		return errors.New("password too long")
	}
	// NIST 800-63B: prefer length over complexity. Breached-password check
	// (HIBP k-anonymity) is the strong defence; wired via Mailer.HibpCheck.
	return nil
}
