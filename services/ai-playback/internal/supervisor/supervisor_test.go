package supervisor

import "testing"

func TestScoreSessionTriggersFailoverOnHeavyRebuffer(t *testing.T) {
	score := scoreSession(8, 1200, 10) // 80% rebuffer rate, 20% bitrate deficit
	if score < failoverThreshold {
		t.Fatalf("expected failover, got score=%f", score)
	}
}

func TestScoreSessionKeepsHealthyStreams(t *testing.T) {
	score := scoreSession(0, 6000, 20)
	if score >= failoverThreshold {
		t.Fatalf("expected stable, got score=%f", score)
	}
}

func TestScoreSessionTriggersOnPersistentLowBitrate(t *testing.T) {
	score := scoreSession(0, 200, 10) // no rebuffers but stuck at 200kbps
	if score < failoverThreshold {
		t.Fatalf("expected failover for stuck-low bitrate, got score=%f", score)
	}
}
