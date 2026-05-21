package gateway

import (
	"net/http"
	"strings"
)

// SecurityHeaders sets the standard set of headers we want on every gateway
// response. CSP is `default-src 'none'` because the gateway only returns
// JSON; if we ever serve HTML through it (we shouldn't), that has to be
// loosened explicitly per route.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Permissions-Policy", "interest-cohort=()")
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		// Cache safety for authenticated endpoints — never let a shared
		// cache hold per-user JSON.
		h.Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

// CORS is a strict allowlist-based CORS middleware. We deliberately do not
// allow credentials with wildcard origins (browsers reject the combination
// anyway, but it bears repeating).
func CORS(allowedOrigins []string) func(http.Handler) http.Handler {
	allow := make(map[string]bool, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allow[strings.TrimRight(o, "/")] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := strings.TrimRight(r.Header.Get("Origin"), "/")
			if origin != "" && allow[origin] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Device-Id,X-Idempotency-Key")
				w.Header().Set("Access-Control-Expose-Headers", "X-Request-Id,X-RateLimit-Remaining,X-Trial-Days-Left")
				w.Header().Set("Access-Control-Max-Age", "600")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
