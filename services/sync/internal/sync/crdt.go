// Package sync implements the cross-device sync CRDT.
//
// We use Last-Writer-Wins for scalar fields and an Observed-Remove Set (OR-Set)
// for collections (favourites). Both converge under any reorder of operations.
package sync

import "time"

// LWWMap is a Last-Writer-Wins register-of-maps. Each key tracks (value, ts,
// origin) where ts is a Lamport-like clock and origin is the device id used
// to break ties.
type LWWMap struct {
	values map[string]lwwEntry
}

type lwwEntry struct {
	value  string
	ts     time.Time
	origin string
}

// NewLWWMap builds an empty map.
func NewLWWMap() *LWWMap { return &LWWMap{values: map[string]lwwEntry{}} }

// Set assigns key=value with timestamp/origin.
func (m *LWWMap) Set(key, value string, ts time.Time, origin string) {
	cur, ok := m.values[key]
	if !ok || ts.After(cur.ts) || (ts.Equal(cur.ts) && origin > cur.origin) {
		m.values[key] = lwwEntry{value: value, ts: ts, origin: origin}
	}
}

// Get returns the current value (or zero string).
func (m *LWWMap) Get(key string) string { return m.values[key].value }

// ORSet is an Observed-Remove Set. Each element addition carries a unique
// tag; removal removes only the tags observed at the time of removal.
// A re-added element after removal converges correctly.
type ORSet struct {
	added   map[string]map[string]struct{} // element -> set of tags
	removed map[string]map[string]struct{} // element -> tags observed at removal
}

// NewORSet builds an empty OR-Set.
func NewORSet() *ORSet {
	return &ORSet{added: map[string]map[string]struct{}{}, removed: map[string]map[string]struct{}{}}
}

// Add inserts element with the given tag (eg device id + counter).
func (s *ORSet) Add(elem, tag string) {
	if s.added[elem] == nil {
		s.added[elem] = map[string]struct{}{}
	}
	s.added[elem][tag] = struct{}{}
}

// Remove removes element by observed tags.
func (s *ORSet) Remove(elem string, observedTags []string) {
	if s.removed[elem] == nil {
		s.removed[elem] = map[string]struct{}{}
	}
	for _, t := range observedTags {
		s.removed[elem][t] = struct{}{}
	}
}

// Contains returns true if at least one un-removed tag exists for elem.
func (s *ORSet) Contains(elem string) bool {
	for tag := range s.added[elem] {
		if _, gone := s.removed[elem][tag]; !gone {
			return true
		}
	}
	return false
}

// Merge folds other into s in-place.
func (s *ORSet) Merge(other *ORSet) {
	for elem, tags := range other.added {
		if s.added[elem] == nil {
			s.added[elem] = map[string]struct{}{}
		}
		for t := range tags {
			s.added[elem][t] = struct{}{}
		}
	}
	for elem, tags := range other.removed {
		if s.removed[elem] == nil {
			s.removed[elem] = map[string]struct{}{}
		}
		for t := range tags {
			s.removed[elem][t] = struct{}{}
		}
	}
}
