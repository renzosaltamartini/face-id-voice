ALTER TABLE passkeys ADD COLUMN label TEXT;
ALTER TABLE passkeys ADD COLUMN created_at INTEGER;

CREATE TABLE account_events (
  id INTEGER PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  device TEXT NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX account_events_recent ON account_events(account_id, id DESC);
