PRAGMA foreign_keys = ON;

CREATE TABLE recommendations (
  id TEXT PRIMARY KEY,
  comment_text TEXT NOT NULL CHECK (length(comment_text) BETWEEN 1 AND 1000),
  decision TEXT NOT NULL CHECK (decision IN ('meme', 'none')),
  candidates_json TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX recommendations_expires_at ON recommendations (expires_at);

CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  recommendation_id TEXT NOT NULL UNIQUE,
  verdict TEXT NOT NULL CHECK (verdict IN ('landed', 'missed')),
  candidate_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (recommendation_id) REFERENCES recommendations(id) ON DELETE CASCADE
);

CREATE INDEX feedback_created_at ON feedback (created_at);
