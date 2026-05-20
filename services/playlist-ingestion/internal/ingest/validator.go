package ingest

import (
	"bufio"
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// streamValidator probes a stream URL to:
//   - confirm it is reachable (HEAD or partial GET),
//   - measure handshake latency,
//   - extract bitrate / resolution / codec from the HLS manifest when possible.
//
// We deliberately do NOT spawn ffprobe per stream — for a catalog of millions
// of streams that is far too expensive. Instead we parse the HLS manifest's
// #EXT-X-STREAM-INF tags, which gives us bitrate, resolution and codec for
// the price of a single HTTP request. Non-HLS or progressive streams fall back
// to a HEAD probe.
type streamValidatorImpl struct {
	client *http.Client
}

// NewStreamValidator returns a validator using its own HTTP client. We share
// the timeout but not the connection pool with the fetcher so manifest probes
// can't starve playlist fetches.
func NewStreamValidator(_ Fetcher) StreamValidator {
	return &streamValidatorImpl{
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (v *streamValidatorImpl) Validate(ctx context.Context, st Stream) ValidationResult {
	start := time.Now()
	url := st.URL

	if isHLS(url) {
		return v.validateHLS(ctx, st, start)
	}
	return v.validateHTTP(ctx, st, start)
}

func (v *streamValidatorImpl) validateHTTP(ctx context.Context, st Stream, start time.Time) ValidationResult {
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, st.URL, nil)
	if err != nil {
		return ValidationResult{Health: HealthDead, ErrorMessage: err.Error()}
	}
	for k, val := range st.Headers {
		req.Header.Set(k, val)
	}
	resp, err := v.client.Do(req)
	if err != nil {
		return ValidationResult{Health: HealthDead, ErrorMessage: err.Error()}
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return ValidationResult{Health: HealthDead, ErrorMessage: "HTTP " + resp.Status}
	}
	return ValidationResult{
		Health:    HealthHealthy,
		LatencyMs: int(time.Since(start).Milliseconds()),
	}
}

func (v *streamValidatorImpl) validateHLS(ctx context.Context, st Stream, start time.Time) ValidationResult {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, st.URL, nil)
	if err != nil {
		return ValidationResult{Health: HealthDead, ErrorMessage: err.Error()}
	}
	for k, val := range st.Headers {
		req.Header.Set(k, val)
	}
	resp, err := v.client.Do(req)
	if err != nil {
		return ValidationResult{Health: HealthDead, ErrorMessage: err.Error()}
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return ValidationResult{Health: HealthDead, ErrorMessage: "HTTP " + resp.Status}
	}

	r := ValidationResult{Health: HealthHealthy, LatencyMs: int(time.Since(start).Milliseconds())}
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 1<<16), 1<<20)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "#EXT-X-STREAM-INF:") {
			parseStreamInf(strings.TrimPrefix(line, "#EXT-X-STREAM-INF:"), &r)
		}
	}
	if err := scanner.Err(); err != nil {
		// Manifest read failed; downgrade to degraded rather than dead.
		r.Health = HealthDegraded
		r.ErrorMessage = err.Error()
	}
	// If the manifest had no STREAM-INF (it's a media playlist already), accept
	// it as healthy without quality details — we won't lie about resolution.
	if r.Width == 0 && r.Height == 0 && r.BitrateKbps == 0 {
		// Detect a media playlist via #EXTINF entries — already consumed above,
		// so just keep Health=Healthy and let the caller treat it as unknown.
	}
	_ = errors.New // appease vet if more sentinel errors are added later
	return r
}

func parseStreamInf(attrs string, r *ValidationResult) {
	for _, kv := range splitAttrs(attrs) {
		eq := strings.IndexByte(kv, '=')
		if eq < 0 {
			continue
		}
		key := strings.TrimSpace(kv[:eq])
		val := strings.Trim(strings.TrimSpace(kv[eq+1:]), "\"")
		switch key {
		case "BANDWIDTH":
			if n, err := strconv.Atoi(val); err == nil {
				kbps := n / 1000
				if kbps > r.BitrateKbps {
					r.BitrateKbps = kbps
				}
			}
		case "RESOLUTION":
			x := strings.IndexByte(val, 'x')
			if x > 0 {
				w, _ := strconv.Atoi(val[:x])
				h, _ := strconv.Atoi(val[x+1:])
				if w*h > r.Width*r.Height {
					r.Width, r.Height = w, h
				}
			}
		case "FRAME-RATE":
			if f, err := strconv.ParseFloat(val, 64); err == nil {
				r.FPS = int(f + 0.5)
			}
		case "CODECS":
			r.VideoCodec, r.AudioCodec = mapCodecs(val)
		case "VIDEO-RANGE":
			switch strings.ToUpper(val) {
			case "PQ":
				r.HDR10 = true
			case "HLG":
				r.HDR10 = true
			}
		}
	}
}

// splitAttrs splits CSV but respects quoted values.
func splitAttrs(s string) []string {
	var out []string
	inQuote := false
	last := 0
	for i, r := range s {
		switch r {
		case '"':
			inQuote = !inQuote
		case ',':
			if !inQuote {
				out = append(out, s[last:i])
				last = i + 1
			}
		}
	}
	out = append(out, s[last:])
	return out
}

func mapCodecs(codecs string) (video, audio string) {
	for _, c := range strings.Split(codecs, ",") {
		c = strings.TrimSpace(c)
		switch {
		case strings.HasPrefix(c, "avc1"):
			video = "h264"
		case strings.HasPrefix(c, "hev1"), strings.HasPrefix(c, "hvc1"):
			video = "h265"
		case strings.HasPrefix(c, "av01"):
			video = "av1"
		case strings.HasPrefix(c, "mp4a"):
			audio = "aac"
		case strings.HasPrefix(c, "ac-3"):
			audio = "ac3"
		case strings.HasPrefix(c, "ec-3"):
			audio = "eac3"
		case strings.HasPrefix(c, "opus"):
			audio = "opus"
		}
	}
	return
}

func isHLS(url string) bool {
	lower := strings.ToLower(url)
	return strings.Contains(lower, ".m3u8") || strings.Contains(lower, "/hls/") || strings.Contains(lower, "playlist.m3u")
}
