ALTER TABLE room_folders ADD COLUMN sort_order INTEGER;
ALTER TABLE room_pages ADD COLUMN sort_order INTEGER;

CREATE TABLE room_entries (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('reminder', 'date', 'expense')),
  title TEXT NOT NULL,
  day TEXT NOT NULL,
  cents INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  PRIMARY KEY (account_id, id)
) STRICT;
