CREATE TABLE room_presence (
  share TEXT NOT NULL REFERENCES room_shares(token) ON DELETE CASCADE,
  client TEXT NOT NULL,
  name TEXT NOT NULL,
  x REAL,
  y REAL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (share, client)
) STRICT;

CREATE INDEX room_presence_expiry ON room_presence(expires_at);

CREATE TRIGGER room_presence_clear AFTER UPDATE OF permission ON room_shares
WHEN NEW.permission <> 'edit'
BEGIN
  DELETE FROM room_presence WHERE share = NEW.token;
END;
