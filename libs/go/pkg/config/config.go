// Package config provides minimal, opinionated environment-variable based
// configuration loading. We intentionally avoid YAML/TOML config files: every
// production knob is an env var, which works cleanly with k8s, secrets stores,
// and 12-factor deployments.
package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

// String returns the env var or fallback.
func String(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

// MustString returns the env var or panics.
func MustString(key string) string {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		panic("missing required env var: " + key)
	}
	return v
}

// Int parses an integer env var.
func Int(key string, fallback int) int {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

// Bool parses a boolean env var (true/false/1/0/yes/no).
func Bool(key string, fallback bool) bool {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		switch strings.ToLower(v) {
		case "1", "true", "yes", "y", "on":
			return true
		case "0", "false", "no", "n", "off":
			return false
		}
	}
	return fallback
}

// Duration parses a time.Duration env var.
func Duration(key string, fallback time.Duration) time.Duration {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}

// CSV returns a comma-separated env var split into a string slice.
func CSV(key string) []string {
	v := os.Getenv(key)
	if v == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	for i := range parts {
		parts[i] = strings.TrimSpace(parts[i])
	}
	return parts
}
