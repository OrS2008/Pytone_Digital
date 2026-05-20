// Package reco implements the personalized ranking primitives.
package reco

import "sort"

// Candidate is a recommendation candidate prior to ranking.
type Candidate struct {
	ID         string
	Relevance  float64
	Genres     []string
	SeriesID   string
	Embedding  []float32
}

// MaximalMarginalRelevance produces a diverse ordering of size k from a set of
// candidates. Diversity is measured by both shared genre overlap and cosine
// distance between content embeddings (when present).
//
// score = λ * relevance(d) - (1-λ) * max_{d' already chosen} similarity(d, d')
func MaximalMarginalRelevance(cands []Candidate, k int, lambda float64) []Candidate {
	if k <= 0 || k >= len(cands) {
		return cands
	}
	if lambda <= 0 || lambda >= 1 {
		lambda = 0.7
	}
	sort.Slice(cands, func(i, j int) bool { return cands[i].Relevance > cands[j].Relevance })

	chosen := make([]Candidate, 0, k)
	chosen = append(chosen, cands[0])
	remaining := cands[1:]

	for len(chosen) < k && len(remaining) > 0 {
		bestIdx := 0
		bestScore := -1e18
		for i, c := range remaining {
			maxSim := 0.0
			for _, p := range chosen {
				sim := similarity(c, p)
				if sim > maxSim {
					maxSim = sim
				}
			}
			score := lambda*c.Relevance - (1-lambda)*maxSim
			if score > bestScore {
				bestScore = score
				bestIdx = i
			}
		}
		chosen = append(chosen, remaining[bestIdx])
		remaining = append(remaining[:bestIdx], remaining[bestIdx+1:]...)
	}
	return chosen
}

func similarity(a, b Candidate) float64 {
	if a.SeriesID != "" && a.SeriesID == b.SeriesID {
		return 1.0
	}
	overlap := 0
	for _, ga := range a.Genres {
		for _, gb := range b.Genres {
			if ga == gb {
				overlap++
			}
		}
	}
	g := float64(overlap) / float64(maxInt(len(a.Genres)+len(b.Genres), 1))
	if len(a.Embedding) > 0 && len(a.Embedding) == len(b.Embedding) {
		return 0.4*g + 0.6*cosine(a.Embedding, b.Embedding)
	}
	return g
}

func cosine(a, b []float32) float64 {
	var dot, na, nb float64
	for i := range a {
		dot += float64(a[i] * b[i])
		na += float64(a[i] * a[i])
		nb += float64(b[i] * b[i])
	}
	if na == 0 || nb == 0 {
		return 0
	}
	return dot / (sqrt(na) * sqrt(nb))
}

func sqrt(x float64) float64 {
	if x <= 0 {
		return 0
	}
	// Newton's method, 8 iterations is plenty for our range.
	z := x
	for i := 0; i < 8; i++ {
		z = (z + x/z) / 2
	}
	return z
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
