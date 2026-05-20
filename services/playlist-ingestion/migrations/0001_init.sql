-- Playlist ingestion service schema.
--
-- Design notes:
--   * Channels are deterministic UUIDs derived from (source_id, tvg-id, name).
--     This means a refresh that re-emits the same channel keeps its id stable,
--     so favourites and watch-history don't break.
--   * Streams are a separate table. A single channel may have many backing
--     stream URLs (HD, FHD, 4K, backup origins). We dedupe on url_hash.
--   * Health metadata lives on the stream row, not the channel, so a channel
--     with one dead 4K stream and one healthy 1080p stream stays usable.
--   * Categories use a Postgres text[] so we can index with GIN for fast
--     category filtering.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS playlist_sources (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id           UUID NOT NULL,
    name               TEXT NOT NULL,
    kind               TEXT NOT NULL CHECK (kind IN (
        'm3u','xtream','stalker','hls','dash','jellyfin','plex','smb','nfs','ota','local'
    )),
    url                TEXT NOT NULL,
    username           TEXT NOT NULL DEFAULT '',
    password           TEXT NOT NULL DEFAULT '',
    refresh_cron       TEXT NOT NULL DEFAULT '',
    last_refreshed_at  TIMESTAMPTZ,
    channel_count      INTEGER NOT NULL DEFAULT 0,
    enabled            BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_playlist_sources_owner ON playlist_sources(owner_id);

CREATE TABLE IF NOT EXISTS channels (
    id                UUID PRIMARY KEY,
    source_id         UUID NOT NULL REFERENCES playlist_sources(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    display_name      TEXT NOT NULL DEFAULT '',
    logo_url          TEXT NOT NULL DEFAULT '',
    categories        TEXT[] NOT NULL DEFAULT '{}',
    country           TEXT NOT NULL DEFAULT '',
    language          TEXT NOT NULL DEFAULT '',
    epg_id            TEXT NOT NULL DEFAULT '',
    channel_number    INTEGER NOT NULL DEFAULT 0,
    catchup           TEXT NOT NULL DEFAULT '',
    catchup_days      INTEGER NOT NULL DEFAULT 0,
    catchup_template  TEXT NOT NULL DEFAULT '',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_channels_source           ON channels(source_id);
CREATE INDEX IF NOT EXISTS idx_channels_epg              ON channels(epg_id) WHERE epg_id <> '';
CREATE INDEX IF NOT EXISTS idx_channels_categories_gin   ON channels USING GIN (categories);
CREATE INDEX IF NOT EXISTS idx_channels_name_trgm        ON channels USING GIN (name gin_trgm_ops);

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS streams (
    id              UUID PRIMARY KEY,
    channel_id      UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    url             TEXT NOT NULL,
    url_hash        BIGINT NOT NULL,
    headers         JSONB NOT NULL DEFAULT '{}'::jsonb,
    priority        INTEGER NOT NULL DEFAULT 100,
    health          TEXT NOT NULL DEFAULT 'unknown'
                       CHECK (health IN ('unknown','healthy','degraded','dead')),
    latency_ms      INTEGER NOT NULL DEFAULT 0,
    bitrate_kbps    INTEGER NOT NULL DEFAULT 0,
    width           INTEGER NOT NULL DEFAULT 0,
    height          INTEGER NOT NULL DEFAULT 0,
    fps             INTEGER NOT NULL DEFAULT 0,
    video_codec     TEXT NOT NULL DEFAULT '',
    audio_codec     TEXT NOT NULL DEFAULT '',
    hdr10           BOOLEAN NOT NULL DEFAULT FALSE,
    dolby_vision    BOOLEAN NOT NULL DEFAULT FALSE,
    last_probed_at  TIMESTAMPTZ,
    last_error      TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (channel_id, url_hash)
);
CREATE INDEX IF NOT EXISTS idx_streams_channel        ON streams(channel_id);
CREATE INDEX IF NOT EXISTS idx_streams_health         ON streams(health);
CREATE INDEX IF NOT EXISTS idx_streams_priority       ON streams(channel_id, priority);
