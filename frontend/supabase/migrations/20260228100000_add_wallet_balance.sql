-- Add SOL balance to profiles for wallet section display (run in Supabase SQL Editor if needed)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sol_balance numeric DEFAULT 0;

COMMENT ON COLUMN public.profiles.sol_balance IS 'Cached SOL balance (devnet) from last wallet connect/sync';
