package safehttp

import (
	"net"
	"testing"
)

func TestClassifyBlocked(t *testing.T) {
	cases := []struct {
		ip     string
		block  bool
		reason string
	}{
		{"127.0.0.1", true, "loopback"},
		{"::1", true, "loopback"},
		{"169.254.169.254", true, "link-local"},
		{"10.0.0.5", true, "private/RFC1918"},
		{"172.16.0.1", true, "private/RFC1918"},
		{"192.168.1.1", true, "private/RFC1918"},
		{"100.64.0.1", true, "carrier-NAT/RFC6598"},
		{"fd00::1", true, "private/RFC1918"},
		{"fe80::1", true, "link-local"},
		{"0.0.0.0", true, "unspecified"},
		{"224.0.0.1", true, "multicast"},
		{"8.8.8.8", false, ""},
		{"1.1.1.1", false, ""},
		{"2606:4700:4700::1111", false, ""},
	}
	for _, c := range cases {
		ip := net.ParseIP(c.ip)
		if ip == nil {
			t.Fatalf("bad test ip %s", c.ip)
		}
		reason, blocked := classifyBlocked(ip)
		if blocked != c.block {
			t.Errorf("%s: blocked=%v want %v (reason=%q)", c.ip, blocked, c.block, reason)
		}
		if c.block && reason != c.reason {
			t.Errorf("%s: reason=%q want %q", c.ip, reason, c.reason)
		}
	}
}

func TestIsBlockedMarker(t *testing.T) {
	if !containsBlockMarker("dial tcp 10.0.0.1: safehttp: refusing to dial 10.0.0.1 (private/RFC1918)") {
		t.Fatal("expected marker match")
	}
	if containsBlockMarker("dial tcp 8.8.8.8: i/o timeout") {
		t.Fatal("expected no marker match")
	}
}
