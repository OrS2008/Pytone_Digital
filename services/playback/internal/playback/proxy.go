package playback

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/novastream/novastream/libs/go/pkg/logging"
)

// ProxyHandler implements the playback proxy. URL scheme:
//
//   /play/{ticketID}/master.m3u8?token=...        -> master manifest
//   /play/{ticketID}/variant.m3u8?v=...&token=... -> variant manifest
//   /play/{ticketID}/seg/{name}?token=...         -> segment
//
// The proxy rewrites manifests on the fly so segment URLs flow back through
// us. We never expose the origin URL to clients.
type ProxyHandler struct {
	tickets *TicketService
	steer   *ABRSteering
	client  *http.Client
}

// NewProxyHandler returns the handler used by /play/.
func NewProxyHandler(tickets *TicketService, steer *ABRSteering) *ProxyHandler {
	return &ProxyHandler{
		tickets: tickets,
		steer:   steer,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (p *ProxyHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	log := logging.From(ctx)

	// Path: /play/{ticketID}/{rest...}
	parts := strings.SplitN(strings.TrimPrefix(r.URL.Path, "/play/"), "/", 2)
	if len(parts) < 2 {
		http.Error(w, "bad path", http.StatusBadRequest)
		return
	}
	ticketID, rest := parts[0], parts[1]

	tk, err := p.tickets.Validate(ctx, ticketID, r.URL.Query().Get("token"))
	if err != nil {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	switch {
	case rest == "master.m3u8":
		p.serveMaster(ctx, w, r, tk)
	case strings.HasPrefix(rest, "variant.m3u8"):
		p.serveVariant(ctx, w, r, tk)
	case strings.HasPrefix(rest, "seg/"):
		p.serveSegment(ctx, w, r, tk, strings.TrimPrefix(rest, "seg/"))
	default:
		log.Debug().Str("path", rest).Msg("unknown proxy path")
		http.NotFound(w, r)
	}
}

func (p *ProxyHandler) serveMaster(ctx context.Context, w http.ResponseWriter, r *http.Request, tk Ticket) {
	body, base, err := p.fetch(ctx, tk.OriginURL)
	if err != nil {
		http.Error(w, "origin error", http.StatusBadGateway)
		return
	}
	defer body.Close()

	w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
	rewriteManifest(body, w, base, func(u string) string {
		// Pick which proxied path to use based on whether the rewritten line
		// is a variant manifest (.m3u8) or a media segment.
		if strings.Contains(u, ".m3u8") {
			return fmt.Sprintf("variant.m3u8?token=%s&v=%s",
				url.QueryEscape(r.URL.Query().Get("token")),
				url.QueryEscape(u))
		}
		return fmt.Sprintf("seg/%s?token=%s&u=%s",
			url.QueryEscape(path.Base(u)),
			url.QueryEscape(r.URL.Query().Get("token")),
			url.QueryEscape(u))
	})

	// Tee a QoE manifest sample.
	go p.steer.Observe(context.WithoutCancel(ctx), tk, ObserveSample{Kind: "manifest", Bytes: 0})
}

func (p *ProxyHandler) serveVariant(ctx context.Context, w http.ResponseWriter, r *http.Request, tk Ticket) {
	variantURL := r.URL.Query().Get("v")
	if variantURL == "" {
		http.Error(w, "missing v", http.StatusBadRequest)
		return
	}
	body, base, err := p.fetch(ctx, variantURL)
	if err != nil {
		http.Error(w, "origin error", http.StatusBadGateway)
		return
	}
	defer body.Close()

	w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
	token := r.URL.Query().Get("token")
	rewriteManifest(body, w, base, func(u string) string {
		return fmt.Sprintf("seg/%s?token=%s&u=%s",
			url.QueryEscape(path.Base(u)),
			url.QueryEscape(token),
			url.QueryEscape(u))
	})
}

func (p *ProxyHandler) serveSegment(ctx context.Context, w http.ResponseWriter, r *http.Request, tk Ticket, _ string) {
	upstream := r.URL.Query().Get("u")
	if upstream == "" {
		http.Error(w, "missing u", http.StatusBadRequest)
		return
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, upstream, nil)
	resp, err := p.client.Do(req)
	if err != nil {
		http.Error(w, "origin error", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	for k, v := range resp.Header {
		for _, vv := range v {
			w.Header().Add(k, vv)
		}
	}
	w.WriteHeader(resp.StatusCode)
	written, _ := io.Copy(w, resp.Body)

	if shouldSample(tk.ID) {
		go p.steer.Observe(context.WithoutCancel(ctx), tk, ObserveSample{Kind: "segment", Bytes: int(written)})
	}
}

// fetch retrieves an upstream URL and returns the body plus the base URL used
// for resolving relative paths in manifests.
func (p *ProxyHandler) fetch(ctx context.Context, raw string) (io.ReadCloser, *url.URL, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, nil, err
	}
	if resp.StatusCode/100 != 2 {
		_ = resp.Body.Close()
		return nil, nil, fmt.Errorf("origin %d", resp.StatusCode)
	}
	u, _ := url.Parse(raw)
	return resp.Body, u, nil
}

// rewriteManifest reads an HLS manifest, calls rewrite on each non-comment URI
// line, and writes the result to w. Comments and EXT tags are passed through.
func rewriteManifest(body io.Reader, w io.Writer, base *url.URL, rewrite func(string) string) {
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 64<<10), 1<<20)
	var out bytes.Buffer
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" || strings.HasPrefix(line, "#") {
			out.WriteString(line)
			out.WriteByte('\n')
			continue
		}
		// Resolve relative URIs against the manifest's base.
		ref, err := url.Parse(line)
		var abs string
		if err == nil && base != nil {
			abs = base.ResolveReference(ref).String()
		} else {
			abs = line
		}
		out.WriteString(rewrite(abs))
		out.WriteByte('\n')
	}
	_, _ = w.Write(out.Bytes())
}

// shouldSample picks ~1% of segment fetches to QoE-sample, so we keep
// telemetry cost bounded even at scale. Stable per-ticket so all samples for
// a single session land together.
func shouldSample(ticketID string) bool {
	if len(ticketID) == 0 {
		return false
	}
	return ticketID[len(ticketID)-1]%100 == 0
}
