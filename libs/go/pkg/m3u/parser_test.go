package m3u

import (
	"context"
	"strings"
	"testing"
)

const sample = `#EXTM3U
#EXTINF:-1 tvg-id="bbc1.uk" tvg-name="BBC One HD" tvg-logo="https://example.com/bbc1.png" group-title="UK | Entertainment" catchup="default" catchup-days="7" catchup-source="https://catchup.example/{start}-{duration}.ts" tvg-chno="101",BBC One HD
#EXTVLCOPT:http-user-agent=PytoneTV/1.0
#EXTVLCOPT:http-referrer=https://provider.example/
https://stream.example/bbc1/playlist.m3u8
#EXTINF:-1 tvg-id="news.global" group-title="News",News, Live & Loud
http://stream.example/news.ts
#EXTINF:-1,Malformed missing attrs
http://stream.example/malformed.ts
`

func TestParserExtractsAttrs(t *testing.T) {
	p := New(strings.NewReader(sample))
	out := make(chan Entry, 8)
	if err := p.ParseInto(context.Background(), out); err != nil {
		t.Fatalf("parse: %v", err)
	}
	entries := make([]Entry, 0, 3)
	for e := range out {
		entries = append(entries, e)
	}
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(entries))
	}
	bbc := entries[0]
	if bbc.TvgID != "bbc1.uk" {
		t.Errorf("tvg-id: %q", bbc.TvgID)
	}
	if bbc.Group != "UK | Entertainment" {
		t.Errorf("group: %q", bbc.Group)
	}
	if bbc.CatchupDays != 7 {
		t.Errorf("catchup-days: %d", bbc.CatchupDays)
	}
	if bbc.ChannelNumber != 101 {
		t.Errorf("channel-number: %d", bbc.ChannelNumber)
	}
	if bbc.Headers["User-Agent"] != "PytoneTV/1.0" {
		t.Errorf("user-agent: %v", bbc.Headers)
	}
	if bbc.Headers["Referer"] != "https://provider.example/" {
		t.Errorf("referer: %v", bbc.Headers)
	}
	if bbc.URL != "https://stream.example/bbc1/playlist.m3u8" {
		t.Errorf("url: %q", bbc.URL)
	}

	news := entries[1]
	// The name contains a literal comma; we must not split on it.
	if news.Name != "News, Live & Loud" {
		t.Errorf("name with comma: %q", news.Name)
	}

	mal := entries[2]
	if mal.Name != "Malformed missing attrs" {
		t.Errorf("malformed name: %q", mal.Name)
	}
}
