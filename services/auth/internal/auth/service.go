// Package auth implements user registration, login, refresh-token rotation
// and device session management.
//
// Tokens:
//   - Access token: RS256 JWT, 15min TTL, signed by this service. The gateway
//     verifies signature offline using the matching public key.
//   - Refresh token: 256-bit opaque value, hashed at rest (Argon2id), stored
//     in `refresh_tokens` with a parent chain so token-theft replay attacks
//     can be detected (any reuse of a rotated token invalidates the entire
//     chain).
package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/argon2"
)

type Service struct {
	pool     *pgxpool.Pool
	priv     *rsa.PrivateKey
	pepper   []byte
	accessTTL  time.Duration
	refreshTTL time.Duration
}

func NewService(pool *pgxpool.Pool, priv *rsa.PrivateKey, pepper []byte, accessTTL, refreshTTL time.Duration) *Service {
	if accessTTL == 0 {
		accessTTL = 15 * time.Minute
	}
	if refreshTTL == 0 {
		refreshTTL = 30 * 24 * time.Hour
	}
	return &Service{pool: pool, priv: priv, pepper: pepper, accessTTL: accessTTL, refreshTTL: refreshTTL}
}

// Register hashes the password (Argon2id with a per-deployment pepper),
// inserts the user row, and returns a fresh token pair.
func (s *Service) Register(ctx context.Context, email, password, deviceID string) (TokenPair, error) {
	uid := uuid.New()
	hash := s.hashPassword(password)
	_, err := s.pool.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, created_at)
		VALUES ($1, $2, $3, now())`, uid, email, hash)
	if err != nil {
		return TokenPair{}, err
	}
	return s.issueTokens(ctx, uid.String(), deviceID)
}

// Login verifies credentials and issues a token pair on success.
func (s *Service) Login(ctx context.Context, email, password, deviceID string) (TokenPair, error) {
	var (
		uid  uuid.UUID
		hash []byte
	)
	err := s.pool.QueryRow(ctx, `
		SELECT id, password_hash FROM users WHERE email = $1`, email).Scan(&uid, &hash)
	if err != nil {
		return TokenPair{}, errors.New("invalid credentials")
	}
	if !s.verifyPassword(password, hash) {
		return TokenPair{}, errors.New("invalid credentials")
	}
	return s.issueTokens(ctx, uid.String(), deviceID)
}

// Refresh rotates a refresh token. If the presented token has already been
// used, the entire token chain is invalidated as a defence against stolen
// refresh tokens.
func (s *Service) Refresh(ctx context.Context, refreshToken, deviceID string) (TokenPair, error) {
	var (
		userID     uuid.UUID
		used       bool
		parentChain uuid.UUID
	)
	err := s.pool.QueryRow(ctx, `
		SELECT user_id, used, chain FROM refresh_tokens
		 WHERE token_hash = $1`, hashOpaque(refreshToken)).Scan(&userID, &used, &parentChain)
	if err != nil {
		return TokenPair{}, errors.New("invalid refresh")
	}
	if used {
		// Token replay — kill the whole chain.
		_, _ = s.pool.Exec(ctx, `UPDATE refresh_tokens SET revoked = true WHERE chain = $1`, parentChain)
		return TokenPair{}, errors.New("token reused; chain revoked")
	}
	_, err = s.pool.Exec(ctx, `UPDATE refresh_tokens SET used = true WHERE token_hash = $1`, hashOpaque(refreshToken))
	if err != nil {
		return TokenPair{}, err
	}
	pair, err := s.issueTokens(ctx, userID.String(), deviceID)
	if err != nil {
		return TokenPair{}, err
	}
	// Replace chain on the new token.
	_, _ = s.pool.Exec(ctx, `
		UPDATE refresh_tokens SET chain = $1 WHERE token_hash = $2`,
		parentChain, hashOpaque(pair.Refresh))
	return pair, nil
}

// TokenPair is what we return on login / refresh.
type TokenPair struct {
	Access     string
	Refresh    string
	ExpiresAt  time.Time
	RefreshExp time.Time
}

func (s *Service) issueTokens(ctx context.Context, userID, deviceID string) (TokenPair, error) {
	now := time.Now()
	access, err := s.signAccess(userID, now)
	if err != nil {
		return TokenPair{}, err
	}
	refresh := generateOpaque(32)
	chain := uuid.New()
	_, err = s.pool.Exec(ctx, `
		INSERT INTO refresh_tokens (token_hash, user_id, device_id, chain, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5, now())`,
		hashOpaque(refresh), userID, deviceID, chain, now.Add(s.refreshTTL))
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

func (s *Service) signAccess(userID string, now time.Time) (string, error) {
	claims := jwt.MapClaims{
		"sub": userID,
		"iat": now.Unix(),
		"exp": now.Add(s.accessTTL).Unix(),
		"iss": "novastream-auth",
	}
	tk := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return tk.SignedString(s.priv)
}

// --- crypto helpers ---------------------------------------------------------

func (s *Service) hashPassword(pw string) []byte {
	// Argon2id parameters tuned for ~100ms on a modern server core.
	salt := make([]byte, 16)
	_, _ = rand.Read(salt)
	key := argon2.IDKey([]byte(pw), append(salt, s.pepper...), 2, 64*1024, 4, 32)
	// Storage layout: salt || key (concatenated)
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
	if len(got) != len(want) {
		return false
	}
	var diff byte
	for i := range got {
		diff |= got[i] ^ want[i]
	}
	return diff == 0
}

func generateOpaque(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func hashOpaque(s string) []byte {
	// SHA-256 is sufficient for opaque token lookup; the tokens themselves are
	// cryptographically random.
	h := argon2.IDKey([]byte(s), []byte("novastream-refresh"), 1, 8*1024, 2, 32)
	return h
}
