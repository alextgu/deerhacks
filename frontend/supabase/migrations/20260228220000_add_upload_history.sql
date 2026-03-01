-- Store a token for each Gemini data upload (for token gallery).
-- Each entry: { "at": "2025-02-28T12:00:00.000Z" }

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS upload_history jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.profiles.upload_history IS 'Array of { at: iso date } for each Gemini data update (token gallery).';
