ALTER TABLE accounts ADD COLUMN email_verified_at INTEGER;
ALTER TABLE sessions ADD COLUMN device_id TEXT;
ALTER TABLE sessions ADD COLUMN device_name TEXT;
ALTER TABLE sessions ADD COLUMN created_at INTEGER;
CREATE INDEX sessions_account ON sessions(account_id, expires_at);
CREATE TABLE email_verifications (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  sent_at INTEGER NOT NULL
) STRICT;
