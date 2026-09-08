export const DEVICE_SCHEMA = `
CREATE TABLE IF NOT EXISTS device (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  external_id TEXT NOT NULL,
  activity_id TEXT,
  activity_started_at INTEGER,
  last_push_at INTEGER NOT NULL DEFAULT 0,
  present_until INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT,
  agent TEXT,
  project TEXT,
  avatar TEXT,
  status TEXT NOT NULL,
  progress REAL,
  step_current INTEGER,
  step_total INTEGER,
  url TEXT,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  session_id TEXT,
  title TEXT NOT NULL,
  body TEXT,
  status TEXT,
  agent TEXT,
  project TEXT,
  avatar TEXT,
  url TEXT,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS events_recent ON events (created_at DESC);

CREATE TABLE IF NOT EXISTS budget (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  tokens REAL NOT NULL,
  refilled_at INTEGER NOT NULL
);
`;
