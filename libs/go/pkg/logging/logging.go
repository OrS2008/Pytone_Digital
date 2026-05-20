// Package logging provides a structured logger preconfigured for production.
package logging

import (
	"context"
	"os"

	"github.com/rs/zerolog"
	"go.opentelemetry.io/otel/trace"
)

type ctxKey struct{}

// New builds a service-tagged logger. In production it writes JSON to stdout;
// when stdout is a TTY it switches to a human-readable console format.
func New(service string) zerolog.Logger {
	var w = os.Stdout
	logger := zerolog.New(w).
		With().
		Timestamp().
		Str("service", service).
		Logger()
	if isTTY(w) {
		logger = logger.Output(zerolog.ConsoleWriter{Out: w})
	}
	return logger
}

// Into attaches a logger to a context, enriched with the active span IDs if
// any OpenTelemetry span is currently active.
func Into(ctx context.Context, l zerolog.Logger) context.Context {
	span := trace.SpanContextFromContext(ctx)
	if span.IsValid() {
		l = l.With().
			Str("trace_id", span.TraceID().String()).
			Str("span_id", span.SpanID().String()).
			Logger()
	}
	return context.WithValue(ctx, ctxKey{}, l)
}

// From returns the logger attached to ctx, or a default if none was attached.
func From(ctx context.Context) zerolog.Logger {
	if v := ctx.Value(ctxKey{}); v != nil {
		if l, ok := v.(zerolog.Logger); ok {
			return l
		}
	}
	return zerolog.Nop()
}

func isTTY(f *os.File) bool {
	fi, err := f.Stat()
	if err != nil {
		return false
	}
	return fi.Mode()&os.ModeCharDevice != 0
}
