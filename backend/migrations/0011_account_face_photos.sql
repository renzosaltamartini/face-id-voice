ALTER TABLE qr_requests ADD COLUMN pending_face_photo TEXT;

CREATE TABLE account_face_photos (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  jpeg TEXT NOT NULL CHECK (length(jpeg) <= 18000)
) STRICT;
