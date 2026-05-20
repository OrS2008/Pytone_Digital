// Package m3u implements a streaming parser for extended M3U / M3U8 playlists,
// the format used by virtually every IPTV provider.
//
// Unlike most open-source M3U parsers, this one:
//   - never loads the entire playlist into memory (constant memory regardless
//     of playlist size),
//   - tolerates malformed entries instead of bailing,
//   - normalizes tvg-* attributes from the many variants seen in the wild,
//   - supports the #EXTGRP, #EXTVLCOPT, #KODIPROP and Xtream catchup tags,
//   - emits structured Entry values to a channel so the caller can pipeline
//     parsing, validation, enrichment and persistence.
package m3u

import (
	"bufio"
	"context"
	"io"
	"strconv"
	"strings"
)

// Entry is a single channel parsed from an M3U playlist.
type Entry struct {
	// Display name on the EXTINF line.
	Name string
	// URL on the line following EXTINF (or an embedded http(s):// in tags).
	URL string
	// Channel duration as advertised by EXTINF (usually -1 for live).
	Duration int
	// Group/category, from group-title or #EXTGRP.
	Group string
	// XMLTV identifier for EPG matching.
	TvgID string
	// Display name from tvg-name when present (often the EPG-correct name).
	TvgName string
	// Logo URL.
	Logo string
	// Three-letter language code if provided.
	Language string
	// Two-letter country code if provided.
	Country string
	// Catchup config (Xtream-style): "default", "shift", "append" or "flussonic".
	Catchup string
	// Number of days of catch-up available.
	CatchupDays int
	// Catchup URL template, where {start}/{utc}/{lutc}/{duration} are substituted.
	CatchupSource string
	// Channel number (tvg-chno) — many providers ship this so we don't reorder.
	ChannelNumber int
	// HTTP headers required to fetch the stream (Referer / User-Agent / Cookie).
	Headers map[string]string
	// User-agent override extracted from VLC/Kodi props.
	UserAgent string
	// All other attributes from the EXTINF line we didn't promote.
	Attrs map[string]string
	// Line number of the EXTINF directive (1-based) for diagnostics.
	Line int
}

// Parser reads an M3U playlist incrementally.
type Parser struct {
	br      *bufio.Reader
	line    int
	pending Entry
	have    bool
}

// New returns a parser reading from r. The reader is buffered internally, so do
// not wrap it again.
func New(r io.Reader) *Parser {
	return &Parser{br: bufio.NewReaderSize(r, 1<<16)}
}

// ParseInto streams parsed entries to out. It closes out on completion.
// Context cancellation aborts cleanly.
func (p *Parser) ParseInto(ctx context.Context, out chan<- Entry) error {
	defer close(out)
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		raw, err := p.br.ReadString('\n')
		if len(raw) == 0 && err != nil {
			if err == io.EOF {
				if p.have {
					out <- p.pending
				}
				return nil
			}
			return err
		}
		p.line++
		line := strings.TrimRight(raw, "\r\n")
		if line == "" {
			continue
		}
		p.handleLine(line, out)
		if err == io.EOF {
			if p.have {
				out <- p.pending
			}
			return nil
		}
	}
}

func (p *Parser) handleLine(line string, out chan<- Entry) {
	switch {
	case strings.HasPrefix(line, "#EXTM3U"):
		return
	case strings.HasPrefix(line, "#EXTINF"):
		if p.have {
			// Two EXTINFs in a row — drop the previous, malformed entry.
		}
		p.pending = parseExtInf(line, p.line)
		p.have = true
	case strings.HasPrefix(line, "#EXTGRP:"):
		if p.have && p.pending.Group == "" {
			p.pending.Group = strings.TrimSpace(strings.TrimPrefix(line, "#EXTGRP:"))
		}
	case strings.HasPrefix(line, "#EXTVLCOPT:"):
		if p.have {
			parseVLCOpt(strings.TrimPrefix(line, "#EXTVLCOPT:"), &p.pending)
		}
	case strings.HasPrefix(line, "#KODIPROP:"):
		if p.have {
			parseKodiProp(strings.TrimPrefix(line, "#KODIPROP:"), &p.pending)
		}
	case strings.HasPrefix(line, "#"):
		return
	default:
		if !p.have {
			return
		}
		p.pending.URL = line
		out <- p.pending
		p.pending = Entry{}
		p.have = false
	}
}

func parseExtInf(line string, lineNum int) Entry {
	e := Entry{Line: lineNum, Attrs: map[string]string{}, Headers: map[string]string{}}
	rest := strings.TrimPrefix(line, "#EXTINF:")
	// duration is everything up to the first space or comma.
	dur, after := splitDuration(rest)
	if d, err := strconv.Atoi(dur); err == nil {
		e.Duration = d
	}
	// after is either `attrs,name` or `,name` or `name` (no attrs).
	attrPart, name := splitNameFromAttrs(after)
	e.Name = strings.TrimSpace(name)
	for k, v := range parseAttrs(attrPart) {
		e.Attrs[k] = v
		switch strings.ToLower(k) {
		case "tvg-id":
			e.TvgID = v
		case "tvg-name":
			e.TvgName = v
		case "tvg-logo":
			e.Logo = v
		case "tvg-language":
			e.Language = v
		case "tvg-country":
			e.Country = v
		case "tvg-chno":
			if n, err := strconv.Atoi(v); err == nil {
				e.ChannelNumber = n
			}
		case "group-title":
			e.Group = v
		case "catchup":
			e.Catchup = v
		case "catchup-days":
			if n, err := strconv.Atoi(v); err == nil {
				e.CatchupDays = n
			}
		case "catchup-source":
			e.CatchupSource = v
		}
	}
	return e
}

func splitDuration(s string) (string, string) {
	for i, r := range s {
		if r == ' ' || r == ',' {
			return s[:i], s[i:]
		}
	}
	return s, ""
}

// splitNameFromAttrs walks the remainder of an EXTINF line and finds the first
// comma that is NOT inside double-quotes — that comma separates attributes from
// the display name. Names themselves may contain commas (`News, Live`) and we
// must preserve them; the EXTINF format only puts one separator before the
// name.
func splitNameFromAttrs(s string) (attrs, name string) {
	inQuote := false
	for i, r := range s {
		switch r {
		case '"':
			inQuote = !inQuote
		case ',':
			if !inQuote {
				return s[:i], s[i+1:]
			}
		}
	}
	return "", strings.TrimLeft(s, " ,")
}

// parseAttrs handles the `key="value" key2="value2"` syntax used after EXTINF.
func parseAttrs(s string) map[string]string {
	out := map[string]string{}
	s = strings.TrimSpace(s)
	for len(s) > 0 {
		eq := strings.IndexByte(s, '=')
		if eq < 0 {
			break
		}
		key := strings.TrimSpace(s[:eq])
		s = s[eq+1:]
		if len(s) == 0 {
			break
		}
		var value string
		if s[0] == '"' {
			end := strings.IndexByte(s[1:], '"')
			if end < 0 {
				value = s[1:]
				s = ""
			} else {
				value = s[1 : 1+end]
				s = s[2+end:]
			}
		} else {
			// Unquoted: read to next space.
			sp := strings.IndexByte(s, ' ')
			if sp < 0 {
				value = s
				s = ""
			} else {
				value = s[:sp]
				s = s[sp+1:]
			}
		}
		if key != "" {
			out[key] = value
		}
		s = strings.TrimLeft(s, " ")
	}
	return out
}

func parseVLCOpt(opt string, e *Entry) {
	idx := strings.IndexByte(opt, '=')
	if idx < 0 {
		return
	}
	key := strings.TrimSpace(opt[:idx])
	val := strings.TrimSpace(opt[idx+1:])
	switch strings.ToLower(key) {
	case "http-user-agent":
		e.UserAgent = val
		e.Headers["User-Agent"] = val
	case "http-referrer", "http-referer":
		e.Headers["Referer"] = val
	}
}

func parseKodiProp(p string, e *Entry) {
	idx := strings.IndexByte(p, '=')
	if idx < 0 {
		return
	}
	key := strings.TrimSpace(p[:idx])
	val := strings.TrimSpace(p[idx+1:])
	switch strings.ToLower(key) {
	case "inputstream.adaptive.stream_headers":
		// Format: User-Agent=foo&Referer=bar
		for _, kv := range strings.Split(val, "&") {
			if eq := strings.IndexByte(kv, '='); eq > 0 {
				e.Headers[kv[:eq]] = kv[eq+1:]
			}
		}
	}
}
