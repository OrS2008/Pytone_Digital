package playback

import (
	"bufio"
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/novastream/novastream/libs/go/pkg/logging"
	"github.com/novastream/novastream/libs/go/pkg/safehttp"
)

// ProxyHandler implements the playback proxy. URL scheme:
//
//   /play/{ticketID}/master.m3u8?token=...                  -> master manifest
//   /play/{ticketID}/v/{variantHash}.m3u8?token=...         -> variant manifest
//   /play/{ticketID}/s/{segmentHash}.ts?token=...           -> segment
//
// The proxy ONLY ever fetches URLs derived from the ticket's origin URL.
// Variant + segment hashes index into a per-session whitelist of upstream
// URLs we discovered ourselves by parsing the master and variant manifests.
//
// This closes a critical SSRF: the previous URL scheme let a caller pass any
// `?u=` upstream and have it proxied, including cloud-metadata addresses.
type ProxyHandler struct {
	tickets  *TicketService
	steer    *ABRSteering
	client   *safehttp.Client
	hashKey  []byte // separate key for short URL hashes (not the ticket key)
}

// NewProxyHandler returns the handler used by /play/. `hashKey` keys the
// HMAC used to derive short, opaque variant/segment hashes; it can be the
// same secret as the ticket key.
func NewProxyHandler(tickets *TicketService, steer *ABRSteering, hashKey []byte) *ProxyHandler {
	return &ProxyHandler{
		tickets: tickets,
		steer:   steer,
		hashKey: hashKey,
		client: safehttp.New(safehttp.Options{
			Timeout:      10 * time.Second,
			MaxBodyBytes: 64 << 20, // 64 MB per segment / manifest
			MaxRedirects: 3,
		}),
	}
}

func (p *ProxyHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	log := logging.From(ctx)

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
	case strings.HasPrefix(rest, "v/") && strings.HasSuffix(rest, ".m3u8"):
		hash := strings.TrimSuffix(strings.TrimPrefix(rest, "v/"), ".m3u8")
		p.serveVariant(ctx, w, r, tk, hash)
	case strings.HasPrefix(rest, "s/"):
		hash := strings.TrimPrefix(rest, "s/")
		hash = strings.SplitN(hash, ".", 2)[0]
		p.serveSegment(ctx, w, r, tk, hash)
	default:
		log.Debug().Str("path", rest).Msg("unknown proxy path")
		http.NotFound(w, r)
	}
}

func (p *ProxyHandler) serveMaster(ctx context.Context, w http.ResponseWriter, r *http.Request, tk Ticket) {
	body, base, err := p.fetch(ctx, tk.OriginURL)
	if err != nil {
		writeOriginError(w, err)
		return
	}
	defer body.Close()

	token := r.URL.Query().Get("token")
	w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
	rewriteManifest(body, w, base, func(absURL string) string {
		// Origin must match the ticket's origin host. Cross-origin URIs in a
		// master manifest are unexpected and refused — defence in depth on
		// top of the dial-time guard.
		if !sameHost(absURL, tk.OriginURL) {
			return "# REFUSED: cross-origin URI " + absURL
		}
		hash := p.hashURL(tk.ID, absURL)
		// Remember the URL → hash mapping for the lifetime of the ticket.
		_ = p.tickets.RememberURL(ctx, tk.ID, hash, absURL)
		if strings.Contains(absURL, ".m3u8") {
			return fmt.Sprintf("v/%s.m3u8?token=%s", hash, url.QueryEscape(token))
		}
		return fmt.Sprintf("s/%s.ts?token=%s", hash, url.QueryEscape(token))
	})
	go p.steer.Observe(context.WithoutCancel(ctx), tk, ObserveSample{Kind: "manifest"})
}

func (p *ProxyHandler) serveVariant(ctx context.Context, w http.ResponseWriter, r *http.Request, tk Ticket, hash string) {
	upstream, err := p.tickets.RecallURL(ctx, tk.ID, hash)
	if err != nil {
		http.Error(w, "unknown variant", http.StatusNotFound)
		return
	}
	body, base, err := p.fetch(ctx, upstream)
	if err != nil {
		writeOriginError(w, err)
		return
	}
	defer body.Close()

	token := r.URL.Query().Get("token")
	w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
	rewriteManifest(body, w, base, func(absURL string) string {
		if !sameHost(absURL, tk.OriginURL) {
			return "# REFUSED: cross-origin URI " + absURL
		}
		h := p.hashURL(tk.ID, absURL)
		_ = p.tickets.RememberURL(ctx, tk.ID, h, absURL)
		return fmt.Sprintf("s/%s.ts?token=%s", h, url.QueryEscape(token))
	})
}

func (p *ProxyHandler) serveSegment(ctx context.Context, w http.ResponseWriter, r *http.Request, tk Ticket, hash string) {
	upstream, err := p.tickets.RecallURL(ctx, tk.ID, hash)
	if err != nil {
		http.Error(w, "unknown segment", http.StatusNotFound)
		return
	}

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, upstream, nil)
	resp, err := p.client.Do(req)
	if err != nil {
		writeOriginError(w, err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		http.Error(w, "origin error", http.StatusBadGateway)
		return
	}
	// Pass through only safe headers — never leak origin Set-Cookie etc.
	for _, h := range []string{"Content-Type", "Content-Length", "Cache-Control", "ETag", "Last-Modified"} {
		if v := resp.Header.Get(h); v != "" {
			w.Header().Set(h, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	written, _ := io.Copy(w, resp.Body)

	if shouldSample(tk.ID) {
		go p.steer.Observe(context.WithoutCancel(ctx), tk, ObserveSample{Kind: "segment", Bytes: int(written)})
	}
}

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

// hashURL produces a short, opaque, ticket-bound identifier for an upstream
// URL. Using HMAC ensures an attacker cannot forge a hash for a URL we never
// served (so they cannot trick the recall table into fetching arbitrary URLs).
func (p *ProxyHandler) hashURL(ticketID, url string) string {
	mac := hmac.New(sha256.New, p.hashKey)
	mac.Write([]byte(ticketID))
	mac.Write([]byte{0})
	mac.Write([]byte(url))
	sum := mac.Sum(nil)
	return base64.RawURLEncoding.EncodeToString(sum[:12]) // 16-char hash
}

// sameHost is true when `a` and `b` share scheme + host (port included).
func sameHost(a, b string) bool {
	ua, errA := url.Parse(a)
	ub, errB := url.Parse(b)
	if errA != nil || errB != nil {
		return false
	}
	return ua.Scheme == ub.Scheme && ua.Host == ub.Host
}

func writeOriginError(w http.ResponseWriter, err error) {
	if safehttp.IsBlocked(err) {
		// Don't leak which internal addresses are reachable.
		http.Error(w, "origin error", http.StatusBadGateway)
		return
	}
	http.Error(w, "origin error", http.StatusBadGateway)
}

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

func shouldSample(ticketID string) bool {
	if len(ticketID) == 0 {
		return false
	}
	return ticketID[len(ticketID)-1]%100 == 0
}

var _ = errors.New // satisfy 'errors' import if future edits drop usage
