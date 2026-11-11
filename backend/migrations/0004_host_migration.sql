ALTER TABLE qr_requests ADD COLUMN desktop_origin TEXT NOT NULL DEFAULT 'https://renzosaltamartini.github.io';
ALTER TABLE qr_requests ADD COLUMN phone_origin TEXT NOT NULL DEFAULT 'https://renzosaltamartini.github.io';
ALTER TABLE sessions ADD COLUMN passkey_challenge TEXT;
ALTER TABLE sessions ADD COLUMN passkey_challenge_expires_at INTEGER;
ALTER TABLE passkeys ADD COLUMN rp_id TEXT NOT NULL DEFAULT 'renzosaltamartini.github.io';
CREATE INDEX passkeys_account_rp ON passkeys(account_id, rp_id);
