// Package search provides unified, multi-corpus search across the Pytone
// catalogue.
package search

import (
	"sort"
)

// Result is one hit in a unified search response.
type Result struct {
	ID        string
	Kind      string  // channel, programme, movie, series, recording, sports
	Title     string
	Subtitle  string
	PosterURL string
	Score     float64
}

// ReciprocalRankFusion merges multiple ranked lists into a single ranking.
//
// RRF score:  score(d) = Σ 1 / (k + rank_i(d))
//
// k=60 is the Microsoft / Trotman recommended default. It is robust to
// extreme score distributions and degenerates gracefully when only one source
// returned hits — exactly what we want for hybrid BM25 + ANN search.
func ReciprocalRankFusion(lists [][]Result, k float64) []Result {
	if k <= 0 {
		k = 60
	}
	scores := map[string]float64{}
	first := map[string]Result{}
	for _, list := range lists {
		for rank, r := range list {
			scores[r.ID] += 1.0 / (k + float64(rank+1))
			if _, ok := first[r.ID]; !ok {
				first[r.ID] = r
			}
		}
	}
	out := make([]Result, 0, len(scores))
	for id, s := range scores {
		r := first[id]
		r.Score = s
		out = append(out, r)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Score > out[j].Score })
	return out
}
