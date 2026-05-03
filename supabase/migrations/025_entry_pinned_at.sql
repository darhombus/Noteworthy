-- ============================================================
-- Noteworthy — entry pinned_at timestamp
-- Migration: 025_entry_pinned_at.sql
-- ============================================================
-- Pinned entries should sort by *when they were pinned*, not by edit
-- recency. With migration 024's sort key (is_pinned DESC, updated_at DESC),
-- editing an older pinned entry pulls it above a more recent pin — the
-- opposite of what the user wants. Pinning is a deliberate "this should be
-- on top" action, so the most recently pinned entry belongs at the top of
-- the pinned section.
--
-- New column: entries.pinned_at TIMESTAMPTZ NULL.
-- Trigger maintenance:
--   • INSERT with is_pinned = TRUE  → pinned_at = NOW()
--   • UPDATE flipping is_pinned     → set/clear pinned_at accordingly
--   • Otherwise leave pinned_at alone (so admin/data-migration UPDATEs
--     can set pinned_at directly without the trigger overwriting them)
-- Sort key (in scope.ts) becomes:
--     is_pinned DESC, pinned_at DESC NULLS LAST, updated_at DESC
-- ============================================================


-- ── 1. Column ──────────────────────────────────────────────────────────────

ALTER TABLE entries
  ADD COLUMN pinned_at TIMESTAMPTZ;


-- ── 2. Maintenance trigger ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_entries_pinned_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_pinned THEN
      NEW.pinned_at = COALESCE(NEW.pinned_at, NOW());
    ELSE
      NEW.pinned_at = NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: only touch pinned_at when is_pinned actually flips. Leaving
  -- it alone otherwise lets the backfill below set pinned_at directly,
  -- and lets future admin scripts adjust the timestamp without the
  -- trigger fighting them.
  IF NEW.is_pinned IS DISTINCT FROM OLD.is_pinned THEN
    IF NEW.is_pinned THEN
      NEW.pinned_at = NOW();
    ELSE
      NEW.pinned_at = NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_entries_pinned_at
  BEFORE INSERT OR UPDATE ON entries
  FOR EACH ROW EXECUTE FUNCTION fn_entries_pinned_at();


-- ── 3. Backfill ───────────────────────────────────────────────────────────
-- For existing pinned rows we have no record of when they were pinned, so
-- fall back to updated_at as a best-effort approximation. This UPDATE
-- doesn't change is_pinned, so the trigger above leaves pinned_at as-set.
-- It also doesn't change title/content/entry_date or word_count, so neither
-- fn_entries_set_updated_at nor fn_journals_bump_from_entry_edit (mig 024)
-- bump anything.

UPDATE entries
   SET pinned_at = updated_at
 WHERE is_pinned = TRUE
   AND pinned_at IS NULL;


-- ── 4. Index ──────────────────────────────────────────────────────────────
-- Partial index on the pinned slice — the unpinned majority would just
-- bloat the index with NULLs.

CREATE INDEX idx_entries_pinned_at
  ON entries(pinned_at DESC)
  WHERE is_pinned = TRUE;
