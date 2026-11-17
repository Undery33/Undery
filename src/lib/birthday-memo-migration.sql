-- Apply explicitly to the existing Undery PostgreSQL database before deployment.
-- This migration only adds the birthday_memo schema. It never changes existing tables.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE SCHEMA IF NOT EXISTS birthday_memo;

CREATE TABLE IF NOT EXISTS birthday_memo.schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS birthday_memo.entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nickname text NOT NULL CHECK (char_length(nickname) BETWEEN 1 AND 24),
  message text NOT NULL CHECK (char_length(message) <= 300),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS birthday_memo_entries_order ON birthday_memo.entries(created_at, id);

CREATE TABLE IF NOT EXISTS birthday_memo.tokens (
  token_hash char(64) PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  entry_id bigint UNIQUE REFERENCES birthday_memo.entries(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS birthday_memo_tokens_expiry ON birthday_memo.tokens(expires_at) WHERE entry_id IS NULL;

CREATE TABLE IF NOT EXISTS birthday_memo.rate_limits (
  bucket text NOT NULL,
  client_key char(64) NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL,
  PRIMARY KEY (bucket, client_key, window_start)
);
CREATE INDEX IF NOT EXISTS birthday_memo_rate_limits_expiry ON birthday_memo.rate_limits(window_start);

INSERT INTO birthday_memo.schema_migrations(version) VALUES (1) ON CONFLICT (version) DO NOTHING;
COMMIT;
