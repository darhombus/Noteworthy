-- ============================================================
-- Noteworthy — Enable Realtime broadcasts for the entries table
-- Migration: 009_enable_entries_realtime.sql
-- ============================================================
-- Supabase Realtime only broadcasts Postgres changes for tables that
-- belong to the `supabase_realtime` publication. Without this, every
-- `postgres_changes` subscription on `entries` silently receives zero
-- events — which is what was blocking cross-tab live sync in the entry
-- editor and the dashboard analytics refresher.
--
-- RLS is still enforced per-subscriber when Realtime evaluates who can
-- see each row, so adding the table to the publication does not widen
-- access — it only unblocks the channel.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.entries;
  END IF;
END
$$;
