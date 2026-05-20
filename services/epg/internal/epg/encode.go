package epg

import (
	"encoding/json"
)

// encodeProgramme serializes a programme for the now-next Redis cache.
//
// We use compact JSON rather than msgpack/protobuf to keep this file small;
// in production we'd switch to a fixed-field protobuf for ~2x size reduction
// and deterministic decoding cost.
func encodeProgramme(p *Programme) string {
	b, _ := json.Marshal(p)
	return string(b)
}

func decodeProgramme(raw string) *Programme {
	var p Programme
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return nil
	}
	return &p
}
