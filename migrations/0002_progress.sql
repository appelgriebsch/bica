-- Lesson progress and per-user stats (ADR 0002). Timestamps are ISO-8601 TEXT;
-- the primary keys already index user_id. Rows go with their user (ON DELETE CASCADE).
CREATE TABLE lesson_progress (
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  lesson_id TEXT NOT NULL,
  quiz_score INTEGER NOT NULL DEFAULT 0,
  quiz_total INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE user_stats (
  user_id TEXT PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  streak INTEGER NOT NULL DEFAULT 0,
  last_study_date TEXT,
  total_xp INTEGER NOT NULL DEFAULT 0,
  vocab_cards TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(vocab_cards)),
  floor TEXT NOT NULL DEFAULT 'A1' CHECK (floor IN ('A1', 'A2', 'B1', 'B2', 'C1')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
