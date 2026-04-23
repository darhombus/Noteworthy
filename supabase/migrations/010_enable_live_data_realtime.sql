-- ============================================================
-- Noteworthy — Publish journals and tags to Realtime
-- Migration: 010_enable_live_data_realtime.sql
-- ============================================================
-- Follow-up to 009, which published `entries`. The dashboard, analytics,
-- journals list, recycle bin, and tags management pages also render
-- data from `journals` and `tags`, so those tables need to broadcast
-- changes for cross-tab live refresh to cover the full app.
--
-- RLS continues to be enforced per-subscriber — publication membership
-- only unblocks the channel.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'journals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.journals;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'tags'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tags;
  END IF;
END
$$;
