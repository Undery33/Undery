-- Apply after birthday-memo-migration.sql, to the same existing database.
-- Adds moderation without altering any public application/authentication table.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE birthday_memo.entries ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'visible'
  CHECK (status IN ('visible', 'hidden', 'deleted'));
ALTER TABLE birthday_memo.entries ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE birthday_memo.entries ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE birthday_memo.tokens ADD COLUMN IF NOT EXISTS receipt jsonb;

-- Freeze original upload receipts before allowing an administrator to edit text.
UPDATE birthday_memo.tokens t SET receipt = jsonb_build_object(
  'id', e.id::text, 'nickname', e.nickname, 'message', e.message,
  'createdAt', to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
FROM birthday_memo.entries e WHERE t.entry_id=e.id AND t.receipt IS NULL;

CREATE TABLE IF NOT EXISTS birthday_memo.board_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  moderation_revision bigint NOT NULL DEFAULT 0 CHECK (moderation_revision >= 0)
);
INSERT INTO birthday_memo.board_state(singleton) VALUES (true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS birthday_memo.management_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entry_id bigint NOT NULL,
  action text NOT NULL CHECK (action IN ('create','update','hide','show','trash','restore')),
  actor_id text NOT NULL,
  entry_version bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS birthday_memo_entries_status_order ON birthday_memo.entries(status, created_at, id);
CREATE INDEX IF NOT EXISTS birthday_memo_management_events_entry ON birthday_memo.management_events(entry_id, id);
CREATE TABLE IF NOT EXISTS birthday_memo.management_requests (
  request_id uuid PRIMARY KEY,
  actor_id text NOT NULL,
  payload_hash char(64) NOT NULL,
  entry_id bigint NOT NULL REFERENCES birthday_memo.entries(id),
  receipt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO birthday_memo.schema_migrations(version) VALUES (2) ON CONFLICT DO NOTHING;
COMMIT;
