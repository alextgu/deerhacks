-- Add columns to matches for chat close (both users) and 10-min expiry.
-- Run this in Supabase: SQL Editor → New query → paste → Run.
-- This fixes: Could not find the 'expires_at' column of 'matches' in the schema cache

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS closed_by_user_a boolean NOT NULL DEFAULT false;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS closed_by_user_b boolean NOT NULL DEFAULT false;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMENT ON COLUMN public.matches.closed_by_user_a IS 'User A has closed the chat';
COMMENT ON COLUMN public.matches.closed_by_user_b IS 'User B has closed the chat';
COMMENT ON COLUMN public.matches.expires_at IS 'Chat auto-expires at this time (e.g. created_at + 10 min)';
