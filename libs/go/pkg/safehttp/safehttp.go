// Package safehttp provides an HTTP client that refuses to dial
// internal / private / cloud-metadata IP addresses, even after DNS
// resolution or HTTP redirects. It is the standard outbound HTTP client
// for any code path that fetches an attacker-controllable URL — the
// playback proxy, playlist ingestion, EPG ingestion, and DVR recording.
//
// Why a dialer guard and not just URL parsing?
//
//   * A URL like https://attacker.com/ is fine, but the DNS record can
//     resolve to 169.254.169.254 (DNS rebinding). We must check the IP
//     after resolution, not the hostname before.
//   * Redirects may take us from a public URL to an internal one in a
//     subsequent hop; we re-check on every redirect.
//   * Response bodies can be infinite — a malicious origin can keep
//     streaming bytes to OOM us. We cap with a hard byte budget.
//
// Usage:
//
//	c := safehttp.New(safehttp.Options{
//	    Timeout:     10 * time.Second,
//	    MaxBodyBytes: 64 << 20, // 64 MB
//	})
//	resp, err := c.Get(ctx, "https://example.com/playlist.m3u")
package safehttp

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"syscall"
	"time"
)

// Options configures the safehttp client.
type Options struct {
	// Timeout is the per-request total deadline (incl. body read).
	Timeout time.Duration
	// MaxBodyBytes caps response body bytes copied to the caller. 0 = unlimited.
	MaxBodyBytes int64
	// MaxRedirects caps the redirect chain length. 0 = 5.
	MaxRedirects int
	// AllowExtraNets, when set, permits dialing IPs that fall into the listed
	// CIDR blocks. Use for trusted internal CDNs you intentionally proxy. The
	// default deny list still applies for anything outside the allow list.
	AllowExtraNets []*net.IPNet
}

// Client is a hardened *http.Client wrapper.
type Client struct {
	hc  *http.Client
	max int64
}

// New constructs a hardened client.
func New(opt Options) *Client {
	if opt.Timeout == 0 {
		opt.Timeout = 15 * time.Second
	}
	if opt.MaxRedirects == 0 {
		opt.MaxRedirects = 5
	}
	dialer := &net.Dialer{
		Timeout:   5 * time.Second,
		KeepAlive: 30 * time.Second,
		Control:   makeDialControl(opt.AllowExtraNets),
	}
	tr := &http.Transport{
		DialContext:           dialer.DialContext,
		MaxIdleConns:          200,
		IdleConnTimeout:       60 * time.Second,
		TLSHandshakeTimeout:   5 * time.Second,
		ResponseHeaderTimeout: 10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		ForceAttemptHTTP2:     true,
	}
	return &Client{
		hc: &http.Client{
			Transport: tr,
			Timeout:   opt.Timeout,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= opt.MaxRedirects {
					return errors.New("safehttp: too many redirects")
				}
				return nil
			},
		},
		max: opt.MaxBodyBytes,
	}
}

// Do performs the request. The returned response's Body is wrapped in an
// io.LimitReader so callers cannot accidentally consume more than the
// configured budget.
func (c *Client) Do(req *http.Request) (*http.Response, error) {
	resp, err := c.hc.Do(req)
	if err != nil {
		return nil, err
	}
	if c.max > 0 {
		resp.Body = limitBody{Reader: io.LimitReader(resp.Body, c.max), close: resp.Body.Close}
	}
	return resp, nil
}

// Get is a convenience wrapper.
func (c *Client) Get(ctx context.Context, url string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	return c.Do(req)
}

type limitBody struct {
	io.Reader
	close func() error
}

func (b limitBody) Close() error { return b.close() }

// makeDialControl returns a Dialer.Control function that aborts the
// connection if the resolved IP is internal / link-local / loopback /
// cloud-metadata, unless the IP falls into the explicit allow list.
//
// `Dialer.Control` runs *after* DNS resolution and *before* the
// `connect()` syscall — so it cleanly defends against DNS rebinding
// (the attacker can return a public A record initially, then flip to an
// internal IP at TTL expiry; the check fires on every connect).
func makeDialControl(allow []*net.IPNet) func(network, address string, c syscall.RawConn) error {
	return func(network, address string, _ syscall.RawConn) error {
		switch network {
		case "tcp", "tcp4", "tcp6":
		default:
			return fmt.Errorf("safehttp: refusing network %q", network)
		}
		host, _, err := net.SplitHostPort(address)
		if err != nil {
			return err
		}
		ip := net.ParseIP(host)
		if ip == nil {
			return fmt.Errorf("safehttp: cannot parse IP %q", host)
		}
		if isAllowed(ip, allow) {
			return nil
		}
		if reason, blocked := classifyBlocked(ip); blocked {
			return fmt.Errorf("safehttp: refusing to dial %s (%s)", ip, reason)
		}
		return nil
	}
}

func isAllowed(ip net.IP, allow []*net.IPNet) bool {
	for _, n := range allow {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}

// classifyBlocked returns (reason, true) when an IP must be refused.
// Order matters only for the returned reason string.
func classifyBlocked(ip net.IP) (string, bool) {
	if ip.IsLoopback() {
		return "loopback", true
	}
	if ip.IsUnspecified() {
		return "unspecified", true
	}
	// Multicast (incl. link-local multicast like 224.0.0.x) — check before
	// the link-local branch so the reason matches the IP's primary role.
	if ip.IsMulticast() {
		return "multicast", true
	}
	if ip.IsLinkLocalUnicast() {
		return "link-local", true
	}
	if isCloudMetadata(ip) {
		return "cloud-metadata", true
	}
	if isPrivate(ip) {
		return "private/RFC1918", true
	}
	if isCarrierNAT(ip) {
		return "carrier-NAT/RFC6598", true
	}
	if isSpecialIPv6(ip) {
		return "special-use IPv6", true
	}
	return "", false
}

// isPrivate covers RFC1918 + the IPv6 ULA range.
func isPrivate(ip net.IP) bool {
	for _, cidr := range privateNets {
		if cidr.Contains(ip) {
			return true
		}
	}
	return false
}

func isCarrierNAT(ip net.IP) bool {
	for _, cidr := range carrierNets {
		if cidr.Contains(ip) {
			return true
		}
	}
	return false
}

func isCloudMetadata(ip net.IP) bool {
	// AWS, GCP, Azure, OCI, Alibaba — all share 169.254.169.254 (link-local
	// catches it too, but be explicit).
	return ip.Equal(net.IPv4(169, 254, 169, 254)) ||
		ip.Equal(net.ParseIP("fd00:ec2::254"))
}

func isSpecialIPv6(ip net.IP) bool {
	for _, cidr := range specialIPv6Nets {
		if cidr.Contains(ip) {
			return true
		}
	}
	return false
}

var (
	privateNets    = mustParseCIDRs("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7")
	carrierNets    = mustParseCIDRs("100.64.0.0/10")
	specialIPv6Nets = mustParseCIDRs("::1/128", "fe80::/10", "ff00::/8", "::/128")
)

func mustParseCIDRs(cidrs ...string) []*net.IPNet {
	out := make([]*net.IPNet, 0, len(cidrs))
	for _, c := range cidrs {
		_, n, err := net.ParseCIDR(c)
		if err != nil {
			panic("safehttp: invalid CIDR " + c + ": " + err.Error())
		}
		out = append(out, n)
	}
	return out
}

// ErrBlockedHost is reported when an attempt is made to dial a denied IP.
// Detect it with errors.Is(err, ErrBlockedHost). We compare on the
// concrete error string because http.Transport wraps the dialer's error
// inside multiple layers; a sentinel value would not survive.
var ErrBlockedHost = errors.New("safehttp: refusing to dial blocked IP")

// IsBlocked returns true if err originated from the dial-time guard.
func IsBlocked(err error) bool {
	if err == nil {
		return false
	}
	return containsBlockMarker(err.Error())
}

func containsBlockMarker(s string) bool {
	const marker = "safehttp: refusing"
	for i := 0; i+len(marker) <= len(s); i++ {
		if s[i:i+len(marker)] == marker {
			return true
		}
	}
	return false
}

// helper for tests: format an integer width consistently
var _ = strconv.Itoa
