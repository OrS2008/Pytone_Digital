// Package xmltv implements a streaming parser for XMLTV files, the de-facto
// standard format used by EPG providers.
//
// As with the M3U parser, this implementation streams: it uses encoding/xml's
// Token() API to emit programmes one-by-one, so multi-gigabyte EPG dumps don't
// blow up memory.
package xmltv

import (
	"context"
	"encoding/xml"
	"io"
	"time"
)

// Channel is an XMLTV `<channel>` element.
type Channel struct {
	ID          string
	DisplayName string
	IconURL     string
}

// Programme is an XMLTV `<programme>` element.
type Programme struct {
	ChannelID   string
	Start       time.Time
	Stop        time.Time
	Title       string
	SubTitle    string
	Description string
	Categories  []string
	Icon        string
	Season      int
	Episode     int
	Rating      string
	New         bool
	Live        bool
}

// Sink receives parsed elements.
type Sink interface {
	OnChannel(Channel) error
	OnProgramme(Programme) error
}

// Parse streams through r calling sink.OnChannel / sink.OnProgramme for each
// element. ctx cancellation stops parsing early.
func Parse(ctx context.Context, r io.Reader, sink Sink) error {
	dec := xml.NewDecoder(r)
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		tok, err := dec.Token()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		se, ok := tok.(xml.StartElement)
		if !ok {
			continue
		}
		switch se.Name.Local {
		case "channel":
			c, err := decodeChannel(dec, se)
			if err != nil {
				return err
			}
			if err := sink.OnChannel(c); err != nil {
				return err
			}
		case "programme":
			p, err := decodeProgramme(dec, se)
			if err != nil {
				return err
			}
			if err := sink.OnProgramme(p); err != nil {
				return err
			}
		}
	}
}

type rawChannel struct {
	XMLName     xml.Name `xml:"channel"`
	ID          string   `xml:"id,attr"`
	DisplayName string   `xml:"display-name"`
	Icon        struct {
		Src string `xml:"src,attr"`
	} `xml:"icon"`
}

type rawProgramme struct {
	XMLName  xml.Name `xml:"programme"`
	Start    string   `xml:"start,attr"`
	Stop     string   `xml:"stop,attr"`
	Channel  string   `xml:"channel,attr"`
	Title    string   `xml:"title"`
	SubTitle string   `xml:"sub-title"`
	Desc     string   `xml:"desc"`
	Category []string `xml:"category"`
	Icon     struct {
		Src string `xml:"src,attr"`
	} `xml:"icon"`
	EpisodeNum []struct {
		System string `xml:"system,attr"`
		Value  string `xml:",chardata"`
	} `xml:"episode-num"`
	Rating struct {
		Value string `xml:"value"`
	} `xml:"rating"`
	New  *struct{} `xml:"new"`
	Live *struct{} `xml:"live"`
}

func decodeChannel(dec *xml.Decoder, se xml.StartElement) (Channel, error) {
	var rc rawChannel
	if err := dec.DecodeElement(&rc, &se); err != nil {
		return Channel{}, err
	}
	return Channel{ID: rc.ID, DisplayName: rc.DisplayName, IconURL: rc.Icon.Src}, nil
}

func decodeProgramme(dec *xml.Decoder, se xml.StartElement) (Programme, error) {
	var rp rawProgramme
	if err := dec.DecodeElement(&rp, &se); err != nil {
		return Programme{}, err
	}
	p := Programme{
		ChannelID:   rp.Channel,
		Title:       rp.Title,
		SubTitle:    rp.SubTitle,
		Description: rp.Desc,
		Categories:  rp.Category,
		Icon:        rp.Icon.Src,
		Rating:      rp.Rating.Value,
		New:         rp.New != nil,
		Live:        rp.Live != nil,
	}
	p.Start, _ = ParseXMLTVTime(rp.Start)
	p.Stop, _ = ParseXMLTVTime(rp.Stop)
	for _, en := range rp.EpisodeNum {
		if en.System == "xmltv_ns" {
			p.Season, p.Episode = parseXMLTVNS(en.Value)
		}
	}
	return p, nil
}

// ParseXMLTVTime accepts the various date formats used by XMLTV in the wild:
//   - 20240115223000 +0000
//   - 20240115223000 -0500
//   - 20240115223000
//   - 20240115223000Z
func ParseXMLTVTime(s string) (time.Time, error) {
	formats := []string{
		"20060102150405 -0700",
		"20060102150405-0700",
		"20060102150405Z",
		"20060102150405",
		"200601021504",
	}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, &time.ParseError{Value: s, Layout: "XMLTV"}
}

// parseXMLTVNS parses `1.2.0/1` style season/episode. It is zero-based.
func parseXMLTVNS(s string) (season, episode int) {
	var seasonPart, episodePart string
	dotsFound := 0
	for _, r := range s {
		if r == '.' {
			dotsFound++
			continue
		}
		if dotsFound == 0 {
			seasonPart += string(r)
		} else if dotsFound == 1 {
			episodePart += string(r)
		} else {
			break
		}
	}
	parseFirstInt := func(s string) int {
		out := 0
		for _, r := range s {
			if r < '0' || r > '9' {
				break
			}
			out = out*10 + int(r-'0')
		}
		return out
	}
	if seasonPart != "" {
		season = parseFirstInt(seasonPart) + 1
	}
	if episodePart != "" {
		episode = parseFirstInt(episodePart) + 1
	}
	return
}
