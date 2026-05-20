-- EPG schema. The programmes table is the hot table — billions of rows in a
-- mature deployment — so we partition by day.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS programmes (
    id                   UUID NOT NULL,
    channel_id           UUID NOT NULL,
    epg_channel_id       TEXT NOT NULL,
    start_at             TIMESTAMPTZ NOT NULL,
    stop_at              TIMESTAMPTZ NOT NULL,
    title                TEXT NOT NULL,
    sub_title            TEXT NOT NULL DEFAULT '',
    description          TEXT NOT NULL DEFAULT '',
    categories           TEXT[] NOT NULL DEFAULT '{}',
    poster_url           TEXT NOT NULL DEFAULT '',
    backdrop_url         TEXT NOT NULL DEFAULT '',
    season               INTEGER NOT NULL DEFAULT 0,
    episode              INTEGER NOT NULL DEFAULT 0,
    rating               TEXT NOT NULL DEFAULT '',
    is_live              BOOLEAN NOT NULL DEFAULT FALSE,
    is_new               BOOLEAN NOT NULL DEFAULT FALSE,
    catchup_available    BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (channel_id, start_at)
) PARTITION BY RANGE (start_at);

-- Bootstrap partitions: create a partition per day for ±21 days from now.
-- A pg_cron / background job in production maintains a rolling window.
-- For local dev we create a permissive default partition.
CREATE TABLE IF NOT EXISTS programmes_default PARTITION OF programmes DEFAULT;

CREATE INDEX IF NOT EXISTS idx_programmes_channel_window ON programmes(channel_id, start_at, stop_at);
CREATE INDEX IF NOT EXISTS idx_programmes_epg_channel    ON programmes(epg_channel_id);
CREATE INDEX IF NOT EXISTS idx_programmes_title_trgm     ON programmes USING GIN (title gin_trgm_ops);
