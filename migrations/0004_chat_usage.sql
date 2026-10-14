-- Chat turns per user and fixed window (#13): "10m:<start ms>" and "day:<start ms>".
-- At most two rows per user: each turn deletes the user's stale windows.
-- Numbered 0004 so it doesn't collide with #15's 0003; the two are independent.
CREATE TABLE chat_usage (
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  window TEXT NOT NULL,
  turns INTEGER NOT NULL,
  PRIMARY KEY (user_id, window)
);
