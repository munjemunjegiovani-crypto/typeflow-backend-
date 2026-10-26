-- TypeFlow database. Safe to run more than once.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  display_name  VARCHAR(20)  NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- One row for each saved item of a user (profile, settings, results, ...).
CREATE TABLE IF NOT EXISTS user_data (
  user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        VARCHAR(40) NOT NULL,
  value      JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- Typing test scores sent for the leaderboard.
CREATE TABLE IF NOT EXISTS scores (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wpm              NUMERIC(5,1) NOT NULL CHECK (wpm >= 0 AND wpm <= 300),
  accuracy         NUMERIC(4,1) NOT NULL CHECK (accuracy >= 0 AND accuracy <= 100),
  duration_seconds INTEGER      NOT NULL CHECK (duration_seconds > 0),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scores_wpm_idx  ON scores (wpm DESC);
CREATE INDEX IF NOT EXISTS scores_user_idx ON scores (user_id);
