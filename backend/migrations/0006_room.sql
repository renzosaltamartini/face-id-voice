CREATE TABLE room_folders (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (account_id, id)
) STRICT;

CREATE TABLE room_pages (
  account_id TEXT NOT NULL,
  id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, id),
  FOREIGN KEY (account_id, folder_id) REFERENCES room_folders(account_id, id) ON DELETE CASCADE
) STRICT;

CREATE INDEX room_pages_folder ON room_pages(account_id, folder_id);
CREATE INDEX room_pages_recent ON room_pages(account_id, updated_at DESC);
