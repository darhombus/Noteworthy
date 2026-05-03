-- ============================================================
-- Noteworthy — entry favourites + scoped updated_at semantics
-- Migration: 024_entry_favourite_and_scoped_updated_at.sql
-- ============================================================
-- Three things in one migration, because they are intertwined:
--
--   1. entries.is_favorite — boolean column mirroring journals.is_favorite,
--      consumed by the entry card meatball menu and a Favourites filter chip.
--
--   2. Replace the generic fn_set_updated_at trigger on entries and journals
--      with column-aware variants. Today every UPDATE bumps updated_at, so
--      pinning/favouriting/hiding bubbles a row to the top of an
--      updated_at-sorted list — which is wrong: the sort key is supposed to
--      reflect actual user edits, not housekeeping flips.
--
--      • entries.updated_at now stamps NOW() only when title, content, or
--        entry_date change. Pin/favourite/hide/soft-delete leave it untouched.
--
--      • journals.updated_at stamps on title/description/color/icon edits OR
--        when the rollup writes a new entry_count / total_word_count. It
--        also passes through any explicit updated_at bump from another
--        trigger (see #3). Favourite/hide flips no longer reorder a journal.
--
--   3. New AFTER UPDATE trigger on entries that explicitly bumps the parent
--      journal's updated_at whenever entries.updated_at moved. The existing
--      rollup only fires on deleted_at/word_count, so a title-only edit (or
--      an entry_date change, or a content edit that happens to keep the
--      word count identical) wouldn't reach the journal otherwise.
--
-- Order of operations matters here: drop the unified trigger function last
-- since both old triggers reference it.
-- ============================================================


-- ── 1. entries.is_favorite ─────────────────────────────────────────────────

ALTER TABLE entries
  ADD COLUMN is_favorite BOOLEAN NOT NULL DEFAULT FALSE;


-- ── 2a. entries: column-aware updated_at trigger ───────────────────────────

CREATE OR REPLACE FUNCTION fn_entries_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.title      IS DISTINCT FROM OLD.title
     OR NEW.content    IS DISTINCT FROM OLD.content
     OR NEW.entry_date IS DISTINCT FROM OLD.entry_date
  THEN
    NEW.updated_at = NOW();
  ELSE
    -- Preserve OLD.updated_at so pin/favourite/hide/soft-delete don't
    -- reorder the entry list.
    NEW.updated_at = OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_entries_updated_at ON entries;
CREATE TRIGGER trg_entries_updated_at
  BEFORE UPDATE ON entries
  FOR EACH ROW EXECUTE FUNCTION fn_entries_set_updated_at();


-- ── 2b. journals: column-aware updated_at trigger ──────────────────────────

CREATE OR REPLACE FUNCTION fn_journals_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- An upstream trigger or caller may have explicitly bumped updated_at
  -- (see fn_journals_bump_from_entry_edit below). Honour it.
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    RETURN NEW;
  END IF;

  IF NEW.title            IS DISTINCT FROM OLD.title
     OR NEW.description      IS DISTINCT FROM OLD.description
     OR NEW.color            IS DISTINCT FROM OLD.color
     OR NEW.icon             IS DISTINCT FROM OLD.icon
     OR NEW.entry_count      IS DISTINCT FROM OLD.entry_count
     OR NEW.total_word_count IS DISTINCT FROM OLD.total_word_count
  THEN
    NEW.updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journals_updated_at ON journals;
CREATE TRIGGER trg_journals_updated_at
  BEFORE UPDATE ON journals
  FOR EACH ROW EXECUTE FUNCTION fn_journals_set_updated_at();


-- ── 3. propagate entry edits to journal updated_at ─────────────────────────

CREATE OR REPLACE FUNCTION fn_journals_bump_from_entry_edit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only fires when the entry's updated_at moved — fn_entries_set_updated_at
  -- restricts that to genuine edits (title/content/entry_date), so pin/
  -- favourite/hide flips automatically skip this path.
  --
  -- INSERT and DELETE flow through the existing rollup trigger, which
  -- mutates entry_count and reaches journals.updated_at via #2b above.
  IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    RETURN NULL;
  END IF;

  UPDATE journals
     SET updated_at = NOW()
   WHERE journal_id = NEW.journal_id;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_journals_bump_on_entry_edit
  AFTER UPDATE ON entries
  FOR EACH ROW EXECUTE FUNCTION fn_journals_bump_from_entry_edit();
