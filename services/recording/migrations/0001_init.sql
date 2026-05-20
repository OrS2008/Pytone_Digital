-- DVR segment index.
--
-- We deliberately keep this table narrow and heavily indexed: lookups are
-- always range-scans by (channel_id, started_at).

CREATE TABLE IF NOT EXISTS dvr_segments (
    id           BIGSERIAL PRIMARY KEY,
    channel_id   UUID NOT NULL,
    sequence     BIGINT NOT NULL,
    started_at   TIMESTAMPTZ NOT NULL,
    duration_ms  INTEGER NOT NULL,
    object_key   TEXT NOT NULL,
    bytes        BIGINT NOT NULL,
    source_url   TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (channel_id, started_at)
);

CREATE INDEX IF NOT EXISTS idx_dvr_segments_channel_started ON dvr_segments(channel_id, started_at);
CREATE INDEX IF NOT EXISTS idx_dvr_segments_started         ON dvr_segments(started_at);

-- Partitioning option: for very large catalogs, switch to native time-range
-- partitioning by `started_at` with one partition per day. The above schema is
-- declarative-partitioning-ready; only the PARTITION BY needs to be added.
