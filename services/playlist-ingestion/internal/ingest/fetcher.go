package ingest

import (
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/novastream/novastream/libs/go/pkg/safehttp"
)

// HTTPFetcher retrieves a playlist body over HTTP, transparently handling
// gzip-encoded responses and (for Xtream sources) the get.php endpoint.
//
// Uses safehttp.Client: the dialer refuses to connect to internal /
// link-local / loopback / cloud-metadata addresses even when DNS resolution
// is attacker-controlled (DNS-rebinding defence). Without this, a tenant
// could enrol a playlist source URL pointing at 169.254.169.254 or another
// internal address and have the ingester pull bytes from it.
type HTTPFetcher struct {
	client *safehttp.Client
}

// NewHTTPFetcher returns a fetcher with sensible defaults.
func NewHTTPFetcher(timeout time.Duration) *HTTPFetcher {
	if timeout == 0 {
		timeout = 60 * time.Second
	}
	return &HTTPFetcher{
		client: safehttp.New(safehttp.Options{
			Timeout:      timeout,
			MaxBodyBytes: 256 << 20, // 256 MB; huge IPTV catalogues exist
			MaxRedirects: 5,
		}),
	}
}

// Fetch returns a reader of the playlist body and a closer that must be called
// when the caller is done.
func (f *HTTPFetcher) Fetch(ctx context.Context, src Source) (io.Reader, func(), error) {
	url := src.URL
	switch strings.ToLower(src.Kind) {
	case "xtream":
		url = xtreamGetPHP(src)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("Accept-Encoding", "gzip")
	req.Header.Set("User-Agent", "NovaStream/1.0 (+https://novastream.tv)")

	resp, err := f.client.Do(req)
	if err != nil {
		return nil, nil, err
	}
	if resp.StatusCode/100 != 2 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		_ = resp.Body.Close()
		return nil, nil, fmt.Errorf("playlist HTTP %d: %s", resp.StatusCode, string(body))
	}

	var reader io.Reader = resp.Body
	closeFn := func() { _ = resp.Body.Close() }
	if strings.EqualFold(resp.Header.Get("Content-Encoding"), "gzip") {
		gz, err := gzip.NewReader(resp.Body)
		if err != nil {
			_ = resp.Body.Close()
			return nil, nil, err
		}
		reader = gz
		closeFn = func() {
			_ = gz.Close()
			_ = resp.Body.Close()
		}
	}
	return reader, closeFn, nil
}

func xtreamGetPHP(src Source) string {
	base := strings.TrimRight(src.URL, "/")
	return fmt.Sprintf("%s/get.php?username=%s&password=%s&type=m3u_plus&output=ts",
		base, src.Username, src.Password)
}

// Compile-time guard that we still satisfy the Fetcher interface in service.go.
var _ Fetcher = (*HTTPFetcher)(nil)

// keep time imported even if future edits drop usage
var _ = time.Second
