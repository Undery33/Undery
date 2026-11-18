-- Apply explicitly after birthday-memo-management-migration.sql in the existing DB.
-- No entry/content/token changes, no hard deletion, no HTTP-triggered migration.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM birthday_memo.schema_migrations WHERE version=2) THEN
    RAISE EXCEPTION 'Birthday memo management migration (version 2) is required';
  END IF;
END $$;

-- Private idempotency receipts retain a hash, never the owner's raw secret.
-- These must outlive admin restore: expiring receipts would make old URLs active.
CREATE TABLE IF NOT EXISTS birthday_memo.owner_deletion_requests (
  request_id char(32) PRIMARY KEY CHECK (request_id ~ '^[a-f0-9]{32}$'),
  entry_id bigint NOT NULL REFERENCES birthday_memo.entries(id),
  token_hash char(64) NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS birthday_memo_owner_deletion_requests_entry ON birthday_memo.owner_deletion_requests(entry_id);

-- Separate from GitHub administrator history: no invented actor ID and no token,
-- token hash, nickname, message, recovery code, IP address, or request URL.
CREATE TABLE IF NOT EXISTS birthday_memo.owner_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entry_id bigint NOT NULL,
  request_id char(32) NOT NULL REFERENCES birthday_memo.owner_deletion_requests(request_id),
  action text NOT NULL CHECK (action='trash'),
  entry_version bigint NOT NULL CHECK (entry_version > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS birthday_memo_owner_events_entry ON birthday_memo.owner_events(entry_id, id);
INSERT INTO birthday_memo.schema_migrations(version) VALUES (3) ON CONFLICT DO NOTHING;
COMMIT;
