package ingest

import (
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// HTTPFetcher retrieves a playlist body over HTTP, transparently handling
// gzip-encoded responses and (for Xtream sources) the get.php endpoint.
type HTTPFetcher struct {
	client *http.Client
}

// NewHTTPFetcher returns a fetcher with sensible defaults.
func NewHTTPFetcher(timeout time.Duration) *HTTPFetcher {
	if timeout == 0 {
		timeout = 60 * time.Second
	}
	return &HTTPFetcher{
		client: &http.Client{
			Timeout: timeout,
			// We disable the default redirect cap (10) — providers in the wild
			// occasionally chain a dozen redirects before serving the playlist.
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) > 20 {
					return errors.New("too many redirects")
				}
				return nil
			},
		},
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
	req.Header.Set("User-Agent", "Pytone/1.0 (+https://pytone.tv)")

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
