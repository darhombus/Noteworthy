-- ============================================================
-- Noteworthy — catch-up: RLS auto-enable event trigger
-- Migration: 20260826163513_catchup_rls_auto_enable.sql
--
-- Phase EXT (Schema Extraction & Project Move), Section 3.
-- Closes drift items 3 and 4 from docs/schema-drift.md.
--
-- WHY THIS EXISTS
-- `public.rls_auto_enable()` and the `ensure_rls` event trigger that
-- fires it exist in the eu-west-1 project but in no migration file.
--
-- The function was found by the Section 2 dump diff. The EVENT TRIGGER
-- was not, and could not have been: event triggers are cluster-scoped,
-- so `pg_dump --schema public` emits none, and the object reads as
-- absent from both sides of a dump-to-dump diff whether or not it
-- exists. It was found only by querying `pg_event_trigger` — the second
-- instrument EXT-3 requires. Its definition below is reconstructed from
-- those catalog values:
--
--   evtevent   = ddl_command_end
--   evtenabled = 'O'  (enabled, origin)
--   evttags    = {CREATE TABLE, CREATE TABLE AS, SELECT INTO}
--   evtowner   = postgres
--
-- The pair is a safety net: any table later created in `public` gets RLS
-- enabled even if its own migration forgets. CLAUDE.md rule 8 and NW-6
-- both make RLS the security layer, so losing this backstop breaks
-- nothing visibly — which is exactly what makes it worth carrying.
--
-- VERIFICATION NOTE. Because no dump can show this object, the Section 3
-- convergence check for it is a catalog query, not a diff. A clean dump
-- diff is not evidence that this migration worked.
--
-- FORMATTING NOTE. The function body below reproduces the live source
-- byte for byte, including its irregular indentation on the IF / ELSE /
-- END IF lines and the two very long single-line statements. pg_dump
-- emits `prosrc` verbatim, so reflowing the body for readability would
-- leave the replayed function differing from live on exactly those lines
-- — a permanent, cosmetic diff entry for no gain. Do not tidy this.
-- ============================================================

-- ── Drift item 3: public.rls_auto_enable() ──────────────────────────────
-- Verbatim from dump/live-schema.sql.

CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

-- ── Drift item 4: ensure_rls EVENT TRIGGER ──────────────────────────────
-- Ordered after the function it executes.
--
-- `CREATE EVENT TRIGGER` has no IF NOT EXISTS form, so the DROP guard
-- supplies idempotency. Dropping and recreating is safe here: the trigger
-- fires only on DDL, and no DDL runs between these two statements.
--
-- Ownership is left to the creating role rather than set with an explicit
-- ALTER EVENT TRIGGER ... OWNER TO. The migration runs as `postgres`, so
-- the object is already owned by `postgres` and the ALTER would be a
-- no-op — but ALTER EVENT TRIGGER ... OWNER requires superuser, which the
-- `postgres` role on hosted Supabase is not. Including it would add a
-- failure mode without changing the result.

DROP EVENT TRIGGER IF EXISTS "ensure_rls";

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();
