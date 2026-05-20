package gateway

import (
	"context"
	"crypto/rsa"
	"errors"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// AuthMW validates Bearer JWTs signed by the auth service and attaches the
// claims to the request context.
type AuthMW struct {
	pub *rsa.PublicKey
}

// Claims is the subset of JWT claims used by the gateway.
type Claims struct {
	UserID   string   `json:"sub"`
	Tenant   string   `json:"tnt"`
	Profiles []string `json:"prf"`
	Scopes   []string `json:"scp"`
	jwt.RegisteredClaims
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

// Wrap returns a middleware that enforces a valid Bearer JWT.
func (a *AuthMW) Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Health endpoints / introspection skip auth.
		if strings.HasPrefix(r.URL.Path, "/healthz") {
			next.ServeHTTP(w, r)
			return
		}
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			http.Error(w, "missing bearer", http.StatusUnauthorized)
			return
		}
		raw := strings.TrimPrefix(auth, "Bearer ")
		claims := &Claims{}
		_, err := jwt.ParseWithClaims(raw, claims, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
				return nil, errors.New("unexpected alg")
			}
			return a.pub, nil
		})
		if err != nil {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), ctxKey{}, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// ClaimsFromContext extracts the verified claims attached by Wrap.
func ClaimsFromContext(ctx context.Context) (*Claims, bool) {
	c, ok := ctx.Value(ctxKey{}).(*Claims)
	return c, ok
}
