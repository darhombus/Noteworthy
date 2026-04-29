-- ============================================================
-- Noteworthy — exclude hidden entries/journals from tag usage_count
-- Migration: 023_tags_usage_excludes_hidden.sql
-- ============================================================
-- The original fn_tags_usage_count (migration 001) counted EVERY row in
-- entry_tags, regardless of the entry's is_hidden flag or the parent
-- journal's is_hidden flag. The Tags page and Analytics' Top Tags both
-- read tags.usage_count directly, so a tag attached to a vault entry
-- inflated the public counter even though the same entry is correctly
-- omitted from the dropdown query and the Top-Tags entry list.
--
-- Symptom the user hit: "the dropdown shows 3 entries but the counter
-- says 4." Same divergence in Analytics > Top Tags.
--
-- Fix: usage_count = number of (entry_tag, entry, journal) triples
-- where the entry AND its parent journal are visible to the public
-- surface (is_hidden = false on both, not soft-deleted). To keep that
-- count fresh under hide / unhide, we add two cascading recompute
-- triggers — one on entries.is_hidden|deleted_at, one on
-- journals.is_hidden|deleted_at — and backfill once at the end.
-- ============================================================

-- ── 1. Update the entry_tags trigger function ───────────────────────
CREATE OR REPLACE FUNCTION fn_tags_usage_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  target_tag_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_tag_id := OLD.tag_id;
  ELSE
    target_tag_id := NEW.tag_id;
  END IF;

  UPDATE tags
  SET usage_count = (
    SELECT COUNT(*)
    FROM entry_tags et
    JOIN entries  e ON e.entry_id   = et.entry_id
    JOIN journals j ON j.journal_id = e.journal_id
    WHERE et.tag_id      = target_tag_id
      AND e.deleted_at   IS NULL
      AND j.deleted_at   IS NULL
      AND e.is_hidden    = FALSE
      AND j.is_hidden    = FALSE
  )
  WHERE tag_id = target_tag_id;

  RETURN NULL;
END;
$$;

-- ── 2. Recompute on entries.is_hidden / deleted_at flips ────────────
-- Touches every tag attached to the affected entry (usually 0–5 rows).
CREATE OR REPLACE FUNCTION fn_tags_usage_count_for_entry()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  target_entry_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_entry_id := OLD.entry_id;
  ELSE
    target_entry_id := NEW.entry_id;
  END IF;

  UPDATE tags t
  SET usage_count = (
    SELECT COUNT(*)
    FROM entry_tags et
    JOIN entries  e ON e.entry_id   = et.entry_id
    JOIN journals j ON j.journal_id = e.journal_id
    WHERE et.tag_id      = t.tag_id
      AND e.deleted_at   IS NULL
      AND j.deleted_at   IS NULL
      AND e.is_hidden    = FALSE
      AND j.is_hidden    = FALSE
  )
  WHERE t.tag_id IN (
    SELECT tag_id FROM entry_tags WHERE entry_id = target_entry_id
  );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_tags_usage_on_entry_hidden ON entries;
CREATE TRIGGER trg_tags_usage_on_entry_hidden
  AFTER UPDATE OF is_hidden, deleted_at ON entries
  FOR EACH ROW EXECUTE FUNCTION fn_tags_usage_count_for_entry();

-- ── 3. Recompute on journals.is_hidden / deleted_at flips ───────────
-- Hiding a journal cascades: every tag used by every entry in the
-- journal needs its public counter rebuilt.
CREATE OR REPLACE FUNCTION fn_tags_usage_count_for_journal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  target_journal_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_journal_id := OLD.journal_id;
  ELSE
    target_journal_id := NEW.journal_id;
  END IF;

  UPDATE tags t
  SET usage_count = (
    SELECT COUNT(*)
    FROM entry_tags et
    JOIN entries  e ON e.entry_id   = et.entry_id
    JOIN journals j ON j.journal_id = e.journal_id
    WHERE et.tag_id      = t.tag_id
      AND e.deleted_at   IS NULL
      AND j.deleted_at   IS NULL
      AND e.is_hidden    = FALSE
      AND j.is_hidden    = FALSE
  )
  WHERE t.tag_id IN (
    SELECT DISTINCT et.tag_id
    FROM entry_tags et
    JOIN entries e ON e.entry_id = et.entry_id
    WHERE e.journal_id = target_journal_id
  );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_tags_usage_on_journal_hidden ON journals;
CREATE TRIGGER trg_tags_usage_on_journal_hidden
  AFTER UPDATE OF is_hidden, deleted_at ON journals
  FOR EACH ROW EXECUTE FUNCTION fn_tags_usage_count_for_journal();

-- ── 4. Backfill — settle every existing tag's counter ───────────────
UPDATE tags t
SET usage_count = (
  SELECT COUNT(*)
  FROM entry_tags et
  JOIN entries  e ON e.entry_id   = et.entry_id
  JOIN journals j ON j.journal_id = e.journal_id
  WHERE et.tag_id      = t.tag_id
    AND e.deleted_at   IS NULL
    AND j.deleted_at   IS NULL
    AND e.is_hidden    = FALSE
    AND j.is_hidden    = FALSE
);
