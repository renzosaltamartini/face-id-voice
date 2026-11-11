ALTER TABLE qr_requests ADD COLUMN challenge TEXT;
ALTER TABLE qr_requests ADD COLUMN pending_credential TEXT;
ALTER TABLE qr_requests ADD COLUMN redeem_hash TEXT;

CREATE TABLE passkeys (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0
) STRICT;
