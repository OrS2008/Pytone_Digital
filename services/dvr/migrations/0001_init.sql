CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS recordings (
    id                     UUID PRIMARY KEY,
    user_id                UUID NOT NULL,
    channel_id             UUID NOT NULL,
    programme_id           UUID,
    title                  TEXT NOT NULL,
    kind                   TEXT NOT NULL CHECK (kind IN ('one_off','series','keyword','sport','rolling')),
    state                  TEXT NOT NULL CHECK (state IN ('scheduled','recording','completed','failed','deleted'))
                            DEFAULT 'scheduled',
    scheduled_start        TIMESTAMPTZ NOT NULL,
    scheduled_stop         TIMESTAMPTZ NOT NULL,
    actual_start           TIMESTAMPTZ,
    actual_stop            TIMESTAMPTZ,
    size_bytes             BIGINT NOT NULL DEFAULT 0,
    manifest_url           TEXT NOT NULL DEFAULT '',
    poster_url             TEXT NOT NULL DEFAULT '',
    padding_start_seconds  INTEGER NOT NULL DEFAULT 0,
    padding_stop_seconds   INTEGER NOT NULL DEFAULT 0,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (user_id, channel_id, programme_id)
);

CREATE INDEX IF NOT EXISTS idx_recordings_user_state ON recordings(user_id, state);
CREATE INDEX IF NOT EXISTS idx_recordings_state_start ON recordings(state, scheduled_start);

CREATE TABLE IF NOT EXISTS series_rules (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID NOT NULL,
    channel_id             UUID,
    series_id              TEXT NOT NULL DEFAULT '',
    keyword                TEXT NOT NULL DEFAULT '',
    kind                   TEXT NOT NULL CHECK (kind IN ('one_off','series','keyword','sport','rolling')),
    max_recordings         INTEGER NOT NULL DEFAULT 50,
    padding_start_seconds  INTEGER NOT NULL DEFAULT 0,
    padding_stop_seconds   INTEGER NOT NULL DEFAULT 0,
    new_only               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_series_rules_user ON series_rules(user_id);
