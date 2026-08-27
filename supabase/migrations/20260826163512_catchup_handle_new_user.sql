-- ============================================================
-- Noteworthy — catch-up: signup profile trigger
-- Migration: 20260826163512_catchup_handle_new_user.sql
--
-- Phase EXT (Schema Extraction & Project Move), Section 3.
-- Closes drift items 1 and 2 from docs/schema-drift.md.
--
-- WHY THIS EXISTS
-- `public.fn_handle_new_user()` and the `auth.users` trigger that fires
-- it exist in the eu-west-1 project but in no migration file. The
-- Section 2 machine diff found the function missing from the replayed
-- schema; the auth-schema diff found the trigger missing. The migration
-- ledger showed no gap in either direction, so these objects were never
-- written down rather than written down and lost.
--
-- Without them a new project accepts signups and silently creates no
-- `profiles` row. Every authenticated read in the application goes
-- through `profiles`, and `lib/actions/auth.ts` documents the dependency
-- in a comment: "Profile row is created automatically via the
-- fn_handle_new_user trigger".
--
-- Definitions are reproduced verbatim from `dump/live-schema.sql` and
-- `dump/live-auth.sql` rather than rewritten from understanding.
-- ============================================================

-- ── Drift item 1: public.fn_handle_new_user() ───────────────────────────
-- Verbatim from dump/live-schema.sql.

CREATE OR REPLACE FUNCTION "public"."fn_handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."fn_handle_new_user"() OWNER TO "postgres";

-- ── Drift item 2: auth.users AFTER INSERT trigger ───────────────────────
-- Verbatim from dump/live-auth.sql. Ordered after the function it calls.
--
-- `CREATE OR REPLACE TRIGGER` (PG 14+) is idempotent, so this is safe to
-- re-run and safe to push to a project where the trigger already exists.
--
-- This statement writes to the `auth` schema, which the migration runner
-- does not own. Whether it succeeds is established empirically by
-- `supabase db reset`, not assumed — per Section 3's instruction to treat
-- a privilege failure as a finding rather than something to work around.

CREATE OR REPLACE TRIGGER "trg_on_auth_user_created"
  AFTER INSERT ON "auth"."users"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_handle_new_user"();
