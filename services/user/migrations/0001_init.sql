CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS profiles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    name            TEXT NOT NULL,
    avatar          TEXT NOT NULL DEFAULT '',
    audio_lang      TEXT NOT NULL DEFAULT '',
    subtitle_lang   TEXT NOT NULL DEFAULT '',
    parental_rating TEXT NOT NULL DEFAULT '',
    autoplay_next   BOOLEAN NOT NULL DEFAULT TRUE,
    max_bitrate     INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_profiles_user ON profiles(user_id);

CREATE TABLE IF NOT EXISTS favourites (
    profile_id  UUID NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('channel','programme','series','movie')),
    target_id   UUID NOT NULL,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id, kind, target_id)
);

CREATE TABLE IF NOT EXISTS watch_history (
    profile_id   UUID NOT NULL,
    content_id   UUID NOT NULL,
    content_kind TEXT NOT NULL,
    position_ms  BIGINT NOT NULL,
    duration_ms  BIGINT NOT NULL,
    watched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished     BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (profile_id, content_id)
);
CREATE INDEX IF NOT EXISTS idx_watch_history_recent
    ON watch_history(profile_id, watched_at DESC);
