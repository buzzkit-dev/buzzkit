export const ACTOR_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    idempotency_key TEXT,
    name TEXT NOT NULL,
    source TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    received_at TEXT NOT NULL,
    data TEXT NOT NULL,
    run_id TEXT,
    message_id TEXT,
    step TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS events_idempotency_key
    ON events (idempotency_key) WHERE idempotency_key IS NOT NULL`,
  'CREATE INDEX IF NOT EXISTS events_name_sequence ON events (name, sequence)',
  `CREATE TABLE IF NOT EXISTS projections (
    name TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    last_sequence INTEGER NOT NULL,
    last_at TEXT NOT NULL
  )`,
  'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
] as const;
