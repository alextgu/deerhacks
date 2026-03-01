-- Add first_name and last_name to profiles (run in Supabase SQL Editor if not using CLI)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

COMMENT ON COLUMN public.profiles.first_name IS 'User first name (from Auth0 given_name)';
COMMENT ON COLUMN public.profiles.last_name IS 'User last name (from Auth0 family_name)';
