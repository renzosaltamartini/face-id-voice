CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  given_name TEXT NOT NULL,
  family_name TEXT NOT NULL,
  age INTEGER NOT NULL CHECK (age BETWEEN 1 AND 120),
  sex TEXT NOT NULL CHECK (sex IN ('femenino', 'masculino', 'otro', 'sin-declarar')),
  nationality TEXT NOT NULL CHECK (length(nationality) = 2),
  province TEXT NOT NULL,
  locality TEXT NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE qr_requests (
  id TEXT PRIMARY KEY NOT NULL,
  desktop_token_hash TEXT NOT NULL UNIQUE,
  phone_token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('sign-in', 'registration')),
  expires_at INTEGER NOT NULL,
  approved_at INTEGER,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  consumed_at INTEGER,
  CHECK (account_id IS NULL OR approved_at IS NOT NULL),
  CHECK (consumed_at IS NULL OR approved_at IS NOT NULL)
) STRICT;

CREATE INDEX qr_requests_expiry ON qr_requests(expires_at);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
) STRICT;

CREATE INDEX sessions_expiry ON sessions(expires_at);
