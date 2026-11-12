ALTER TABLE room_folders ADD COLUMN parent_id TEXT;
CREATE INDEX room_folders_parent ON room_folders(account_id, parent_id);
