# Supabase migrations

Run SQL in the Supabase dashboard **SQL Editor** (e.g. `20260228000000_add_first_last_name.sql`) to add new columns. The app syncs Auth0 `given_name` → `first_name` and `family_name` → `last_name` on login.
