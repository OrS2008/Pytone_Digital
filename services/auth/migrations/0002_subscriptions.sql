-- Subscription + email-activation + audit log columns.
--
-- Plans:
--   single  : 1 concurrent device
--   multi   : up to 4 concurrent devices
--
-- Subscription states (state machine):
--
--   pending_activation  -- created via /register, awaiting email click
--          │  activate()
--          ▼
--      trialing         -- 7 days from activation
--          │  trial expires    │  user upgrades
--          ▼                   ▼
--       expired              active
--                              │  subscription expires / cancels
--                              ▼
--                          past_due / canceled
--
-- All state transitions are recorded in auth_audit_log for forensics.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'pending_activation'
        CHECK (subscription_status IN (
            'pending_activation',
            'trialing',
            'active',
            'past_due',
            'canceled',
            'expired'
        )),
    ADD COLUMN IF NOT EXISTS plan TEXT
        CHECK (plan IS NULL OR plan IN ('single','multi')),
    ADD COLUMN IF NOT EXISTS devices_max INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS trial_started_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS trial_expires_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sub_started_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sub_expires_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
    ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
    ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_sub_status      ON users(subscription_status);
CREATE INDEX IF NOT EXISTS idx_users_trial_expires   ON users(trial_expires_at) WHERE subscription_status = 'trialing';
CREATE INDEX IF NOT EXISTS idx_users_sub_expires     ON users(sub_expires_at)   WHERE subscription_status IN ('active','past_due');

-- Single-use email tokens for activation, password reset, email change, etc.
CREATE TABLE IF NOT EXISTS email_tokens (
    token_hash   BYTEA PRIMARY KEY,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose      TEXT NOT NULL CHECK (purpose IN ('activate','reset_password','change_email','revoke_devices')),
    expires_at   TIMESTAMPTZ NOT NULL,
    used         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_tokens_user_purpose ON email_tokens(user_id, purpose, expires_at);

-- Audit log for security-sensitive events.
CREATE TABLE IF NOT EXISTS auth_audit_log (
    id         BIGSERIAL PRIMARY KEY,
    user_id    UUID NOT NULL,
    event      TEXT NOT NULL,
    ip         TEXT NOT NULL DEFAULT '',
    detail     TEXT NOT NULL DEFAULT '',
    at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_audit_user_at ON auth_audit_log(user_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_audit_event_at ON auth_audit_log(event, at DESC);

-- Subscription transition history (one row per state change). Distinct from
-- audit_log: this is the source of truth for billing reconciliation.
CREATE TABLE IF NOT EXISTS subscription_transitions (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    from_status TEXT NOT NULL,
    to_status   TEXT NOT NULL,
    reason      TEXT NOT NULL DEFAULT '',
    stripe_event_id TEXT,
    at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subtx_user_at ON subscription_transitions(user_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_subtx_stripe ON subscription_transitions(stripe_event_id) WHERE stripe_event_id IS NOT NULL;

-- Refresh tokens were created in migration 0001; ensure used + revoked
-- columns exist and add an expiry index for fast cleanup.
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
