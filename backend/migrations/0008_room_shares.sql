CREATE TABLE room_shares (
  account_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  permission TEXT NOT NULL CHECK (permission IN ('read', 'edit')),
  PRIMARY KEY (account_id, page_id),
  FOREIGN KEY (account_id, page_id) REFERENCES room_pages(account_id, id) ON DELETE CASCADE
) STRICT;
