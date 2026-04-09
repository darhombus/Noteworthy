-- ============================================================
-- Noteworthy — Migration 006: Media Orphan Cleanup
--
-- 1. Adds `deleted_at` and `object_path` columns to the `media`
--    table so orphaned images can be soft-deleted and later purged
--    together with their storage objects.
--
-- 2. Backfills `object_path` for existing rows by extracting the
--    storage key from the already-stored `file_url`.
--
-- 3. Replaces the existing `purge-deleted` pg_cron job with a new
--    version that:
--      a. Clears `storage.objects` entries for media that will be
--         removed in the same run (before row-level cascades fire,
--         so object_path data is still available).
--      b. Hard-deletes soft-deleted `media` rows.
--      c. Hard-deletes old entries/journals (unchanged logic from
--         001_initial_schema.sql), whose cascade will then remove
--         any remaining media rows whose storage objects were
--         already cleared in step (a).
-- ============================================================


-- ── 1. Schema additions ─────────────────────────────────────

ALTER TABLE media
  ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS object_path  TEXT;

-- Partial index so the cron / reconcile query only scans soft-deleted rows.
CREATE INDEX IF NOT EXISTS idx_media_deleted
  ON media (deleted_at)
  WHERE deleted_at IS NOT NULL;


-- ── 2. Backfill object_path from file_url ───────────────────
--
-- Existing rows have a file_url of the form:
--   https://<project>.supabase.co/storage/v1/object/public/media/<path>
-- Extract everything after the fixed marker.

UPDATE media
SET object_path = substring(file_url FROM '/object/public/media/(.+)$')
WHERE object_path IS NULL
  AND file_url LIKE '%/object/public/media/%';


-- ── 3. Replace the purge-deleted cron job ───────────────────

SELECT cron.unschedule('purge-deleted');

SELECT cron.schedule('purge-deleted', '0 3 * * *', $cron_body$

  -- Step A: Delete storage.objects rows for every media file that
  -- will be removed in this cron run, BEFORE row-level cascades fire.
  -- Covers three cases:
  --   (i)  Media explicitly soft-deleted by the reconcile-on-save logic
  --        (orphaned images the user removed from an entry and saved).
  --   (ii) Media belonging to entries that are about to be hard-purged.
  --   (iii)Media belonging to journals (via their entries) about to be
  --        hard-purged.
  DELETE FROM storage.objects
  WHERE bucket_id = 'media'
    AND name IN (
      SELECT m.object_path
      FROM   media m
      WHERE  m.object_path IS NOT NULL
        AND (
          -- (i) Soft-deleted orphan past its 30-day grace period
          m.deleted_at < NOW() - INTERVAL '30 days'

          -- (ii) Entry about to be hard-purged
          OR m.entry_id IN (
            SELECT entry_id
            FROM   entries
            WHERE  deleted_at < NOW() - INTERVAL '30 days'
          )

          -- (iii) Entry belonging to a journal about to be hard-purged
          OR m.entry_id IN (
            SELECT e.entry_id
            FROM   entries  e
            JOIN   journals j ON j.journal_id = e.journal_id
            WHERE  j.deleted_at < NOW() - INTERVAL '30 days'
          )
        )
    );

  -- Step B: Hard-delete soft-deleted media rows whose storage objects
  -- were cleared above.
  DELETE FROM media
  WHERE deleted_at < NOW() - INTERVAL '30 days';

  -- Step C: Purge old entries and journals.  Any remaining media rows
  -- for these entries are removed by ON DELETE CASCADE; their storage
  -- objects were already cleared in Step A.
  DELETE FROM entries  WHERE deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM journals WHERE deleted_at < NOW() - INTERVAL '30 days';

$cron_body$);
