-- ============================================================
-- Noteworthy — grant PostgREST API roles access to the public schema
--
-- The app's API roles (anon, authenticated, service_role) need
-- table-level GRANTs; Row Level Security policies then restrict which
-- rows each role may touch. On hosted Supabase these grants are applied
-- automatically by the platform, so they were never written into the
-- migrations — but a clean build (local Docker stack, CI, or a fresh
-- hosted project) leaves the API roles with no DML access and every
-- query fails with "permission denied for table ...".
--
-- This makes the grants explicit so the migration set is self-contained.
-- RLS is unchanged, so this adds no new row access: the anon policies in
-- 001 require auth.uid() and therefore still match no rows for anonymous
-- requests. EXECUTE is deliberately NOT blanket-granted here so the
-- targeted function grants/revokes in 002 and 029 stay intact.
--
-- All statements are idempotent (safe to re-run / push to hosted).
-- ============================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Existing tables and sequences.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO anon, authenticated, service_role;

-- Future tables and sequences created by the migration runner (postgres).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
  TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES
  TO anon, authenticated, service_role;
