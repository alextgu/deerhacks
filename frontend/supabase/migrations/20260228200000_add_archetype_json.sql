-- Optional: store full archetype JSON for Gemini icebreaker (from onboarding).
-- Run in Supabase SQL Editor if not using CLI.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS archetype_json jsonb;

COMMENT ON COLUMN public.profiles.archetype_json IS 'Archetype metadata from Gemini onboarding for match blurbs';
