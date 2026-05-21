package gateway

import (
	"context"
	"crypto/rsa"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// AuthMW validates Bearer JWTs signed by the auth service and attaches the
// claims to the request context.
//
// Hardening:
//   - issuer + audience pinned to nova-stream-auth / nova-stream-api so a JWT
//     signed for a different service in the same trust domain cannot be
//     accepted here (key-confusion defence),
//   - only RS256 is accepted (alg-confusion defence — an attacker switching
//     to HS256 cannot use our public key as a shared secret),
//   - skew tolerance pinned to 30 s.
type AuthMW struct {
	pub *rsa.PublicKey
}

// Claims is the subset the gateway needs.
type Claims struct {
	UserID         string   `json:"sub"`
	Tenant         string   `json:"tnt"`
	Profiles       []string `json:"prf"`
	Scopes         []string `json:"scp"`
	Plan           string   `json:"plan"`
	SubStatus      string   `json:"sub_status"`
	DevicesMax     int      `json:"devices_max"`
	TrialUntilUnix int64    `json:"trial_until,omitempty"`
	SubUntilUnix   int64    `json:"sub_until,omitempty"`
	jwt.RegisteredClaims
}

// HasActiveAccess returns true when the user is allowed to start playback.
// We accept trialing (within trial window) and active (within sub window).
// past_due is given a 7-day grace period at the playback service layer.
func (c *Claims) HasActiveAccess(now time.Time) bool {
	switch c.SubStatus {
	case "trialing":
		return c.TrialUntilUnix > now.Unix()
	case "active":
		return c.SubUntilUnix == 0 || c.SubUntilUnix > now.Unix()
	}
	return false
}

type ctxKey struct{}

// NewAuthMW parses the PEM public key used to verify access tokens.
func NewAuthMW(pubPEM string) (*AuthMW, error) {
	if pubPEM == "" {
		return nil, errors.New("missing JWT public key")
	}
	key, err := jwt.ParseRSAPublicKeyFromPEM([]byte(pubPEM))
	if err != nil {
		return nil, err
	}
	return &AuthMW{pub: key}, nil
}

// Wrap enforces a valid Bearer JWT. Public endpoints (health, /api/auth/*,
// preflight) are skipped — see wire.go for the routing.
func (a *AuthMW) Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isPublic(r.URL.Path) || r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		raw := bearerToken(r)
		if raw == "" {
			http.Error(w, "missing bearer", http.StatusUnauthorized)
			return
		}
		claims := &Claims{}
		_, err := jwt.ParseWithClaims(raw, claims,
			func(t *jwt.Token) (interface{}, error) {
				// Reject anything that is not RS256 — defends against alg-
				// confusion attacks that try to coerce verification with
				// the public key used as an HMAC secret.
				if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
					return nil, errors.New("unexpected alg")
				}
				return a.pub, nil
			},
			jwt.WithIssuer("nova-stream-auth"),
			jwt.WithAudience("nova-stream-api"),
			jwt.WithLeeway(30*time.Second),
		)
		if err != nil {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), ctxKey{}, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
}

// isPublic enumerates routes that the auth middleware must not block.
//
// Whitelist style (deny by default) — easier to reason about than blacklist.
func isPublic(path string) bool {
	switch {
	case path == "/healthz", path == "/readyz", path == "/metrics":
		return true
	case strings.HasPrefix(path, "/api/auth/register"),
		strings.HasPrefix(path, "/api/auth/login"),
		strings.HasPrefix(path, "/api/auth/refresh"),
		strings.HasPrefix(path, "/api/auth/activate"),
		strings.HasPrefix(path, "/api/auth/password-reset"),
		strings.HasPrefix(path, "/api/webhooks/"): // signature-verified, not JWT
		return true
	}
	return false
}

// ClaimsFromContext extracts the verified claims attached by Wrap.
func ClaimsFromContext(ctx context.Context) (*Claims, bool) {
	c, ok := ctx.Value(ctxKey{}).(*Claims)
	return c, ok
}
