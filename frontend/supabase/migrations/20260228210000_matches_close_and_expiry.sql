-- Optional: run if your matches table doesn't have these columns.
-- Adds: closed_by_user_a, closed_by_user_b (for "both closed" → shut down), expires_at (10-min auto-expiry).

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS closed_by_user_a boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_by_user_b boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMENT ON COLUMN matches.closed_by_user_a IS 'User A has closed the chat';
COMMENT ON COLUMN matches.closed_by_user_b IS 'User B has closed the chat';
COMMENT ON COLUMN matches.expires_at IS 'Chat auto-expires at this time (e.g. created_at + 10 min)';
