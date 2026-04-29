-- ============================================================
-- Noteworthy — Hidden Vault rebuild
-- Migration: 014_hidden_vault_rebuild.sql
-- ============================================================
-- Replaces the migration 011/012/013 layer:
--   * Vault credentials live on profiles as (vault_secret_type,
--     vault_secret_hash). Either both are set or both are NULL —
--     no half-state.
--   * journals.is_hidden / entries.is_hidden remain (kept from 011),
--     but rollup columns are split: entry_count / total_word_count
--     count ONLY public entries; hidden_entry_count / hidden_word_count
--     count ONLY hidden entries.
--   * search_entries() now takes an explicit p_scope ('public'|'hidden')
--     instead of the old p_include_hidden flag. Public-scope queries
--     filter on BOTH entries.is_hidden = false AND journals.is_hidden
--     = false — a public entry inside a hidden journal is hidden.
--
-- The privacy_pin_type / privacy_pin_hash columns from 011 stay on
-- profiles for the moment to avoid a destructive drop; the app no
-- longer reads them and they will be removed in a follow-up sweep.
-- ============================================================

-- ── profiles: vault credentials ─────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS vault_secret_type TEXT
    CHECK (vault_secret_type IN ('pin','password')),
  ADD COLUMN IF NOT EXISTS vault_secret_hash TEXT,
  ADD COLUMN IF NOT EXISTS vault_auto_lock_minutes INT NOT NULL DEFAULT 5;

-- Either both vault columns are set or both are null. Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vault_secret_complete'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT vault_secret_complete
      CHECK (
        (vault_secret_type IS NULL AND vault_secret_hash IS NULL)
        OR
        (vault_secret_type IS NOT NULL AND vault_secret_hash IS NOT NULL)
      );
  END IF;
END $$;

-- ── is_hidden flags (kept from 011 — idempotent) ────────────────────
ALTER TABLE journals
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Split rollup columns ────────────────────────────────────────────
ALTER TABLE journals
  ADD COLUMN IF NOT EXISTS hidden_entry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hidden_word_count  INT NOT NULL DEFAULT 0;

-- ── Rollup trigger: split public vs hidden ──────────────────────────
-- entry_count / total_word_count → entries WHERE is_hidden = FALSE
-- hidden_entry_count / hidden_word_count → entries WHERE is_hidden = TRUE
-- Recalculation fires on INSERT, DELETE, and UPDATE of either
-- is_hidden, deleted_at, or word_count.
CREATE OR REPLACE FUNCTION fn_journals_rollup()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  target_journal_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_journal_id := OLD.journal_id;
  ELSE
    target_journal_id := NEW.journal_id;
  END IF;

  UPDATE journals
  SET
    entry_count = (
      SELECT COUNT(*)
      FROM entries
      WHERE journal_id = target_journal_id
        AND deleted_at IS NULL
        AND is_hidden  = FALSE
    ),
    total_word_count = (
      SELECT COALESCE(SUM(word_count), 0)
      FROM entries
      WHERE journal_id = target_journal_id
        AND deleted_at IS NULL
        AND is_hidden  = FALSE
    ),
    hidden_entry_count = (
      SELECT COUNT(*)
      FROM entries
      WHERE journal_id = target_journal_id
        AND deleted_at IS NULL
        AND is_hidden  = TRUE
    ),
    hidden_word_count = (
      SELECT COALESCE(SUM(word_count), 0)
      FROM entries
      WHERE journal_id = target_journal_id
        AND deleted_at IS NULL
        AND is_hidden  = TRUE
    )
  WHERE journal_id = target_journal_id;

  RETURN NULL;
END;
$$;

-- Recreate the UPDATE trigger so it also fires when is_hidden flips.
DROP TRIGGER IF EXISTS trg_journals_rollup_update ON entries;
CREATE TRIGGER trg_journals_rollup_update
  AFTER UPDATE OF deleted_at, word_count, is_hidden ON entries
  FOR EACH ROW EXECUTE FUNCTION fn_journals_rollup();
-- INSERT and DELETE triggers from migration 001 already point at
-- fn_journals_rollup() and pick up the new body via CREATE OR REPLACE.

-- Backfill the new split columns for existing data.
UPDATE journals j
SET
  entry_count        = COALESCE(s.public_count,  0),
  total_word_count   = COALESCE(s.public_words,  0),
  hidden_entry_count = COALESCE(s.hidden_count,  0),
  hidden_word_count  = COALESCE(s.hidden_words,  0)
FROM (
  SELECT
    journal_id,
    COUNT(*)             FILTER (WHERE is_hidden = FALSE)        AS public_count,
    SUM(word_count)      FILTER (WHERE is_hidden = FALSE)        AS public_words,
    COUNT(*)             FILTER (WHERE is_hidden = TRUE)         AS hidden_count,
    SUM(word_count)      FILTER (WHERE is_hidden = TRUE)         AS hidden_words
  FROM entries
  WHERE deleted_at IS NULL
  GROUP BY journal_id
) s
WHERE s.journal_id = j.journal_id;

-- ── Indexes: separate public vs hidden hot paths ────────────────────
CREATE INDEX IF NOT EXISTS idx_journals_user_public
  ON journals(user_id, updated_at DESC)
  WHERE is_hidden = FALSE AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_journals_user_hidden
  ON journals(user_id, updated_at DESC)
  WHERE is_hidden = TRUE AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_entries_journal_public
  ON entries(journal_id, is_pinned DESC, entry_date DESC)
  WHERE is_hidden = FALSE AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_entries_journal_hidden
  ON entries(journal_id, is_pinned DESC, entry_date DESC)
  WHERE is_hidden = TRUE AND deleted_at IS NULL;

-- ── search_entries: rebuild with explicit p_scope ───────────────────
-- Adding/removing parameters changes the function signature; PostgREST
-- can't pick between overloads, so DROP every prior signature first.
-- See memory: feedback_postgres_function_signature_change.md.
DROP FUNCTION IF EXISTS search_entries(TEXT, UUID, DATE, DATE, BOOLEAN, UUID[], BOOLEAN);
DROP FUNCTION IF EXISTS search_entries(TEXT, UUID, DATE, DATE, BOOLEAN, UUID[]);
DROP FUNCTION IF EXISTS search_entries(TEXT, UUID, DATE, DATE, BOOLEAN);
DROP FUNCTION IF EXISTS search_entries(TEXT, UUID, DATE, DATE);
DROP FUNCTION IF EXISTS search_entries(TEXT);

CREATE OR REPLACE FUNCTION search_entries(
  p_user_id    UUID,
  p_query      TEXT,
  p_scope      TEXT,                   -- 'public' or 'hidden'. Required.
  p_journal_id UUID    DEFAULT NULL,
  p_from       DATE    DEFAULT NULL,
  p_to         DATE    DEFAULT NULL,
  p_pinned     BOOLEAN DEFAULT NULL,
  p_tag_ids    UUID[]  DEFAULT NULL
)
RETURNS TABLE (
  entry_id      UUID,
  title         TEXT,
  journal_id    UUID,
  journal_title TEXT,
  journal_color TEXT,
  entry_date    DATE,
  word_count    INT,
  snippet       TEXT
)
LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
BEGIN
  IF p_scope NOT IN ('public', 'hidden') THEN
    RAISE EXCEPTION 'Invalid scope: %', p_scope;
  END IF;

  RETURN QUERY
  SELECT
    e.entry_id,
    e.title,
    e.journal_id,
    j.title AS journal_title,
    j.color AS journal_color,
    e.entry_date,
    e.word_count,
    LEFT(coalesce(e.title,'') || ' ' || coalesce(e.content::TEXT,''), 200) AS snippet
  FROM entries  e
  JOIN journals j ON j.journal_id = e.journal_id
  WHERE j.user_id    = p_user_id
    AND e.deleted_at IS NULL
    AND j.deleted_at IS NULL
    AND CASE p_scope
          WHEN 'public' THEN (e.is_hidden = FALSE AND j.is_hidden = FALSE)
          WHEN 'hidden' THEN (e.is_hidden = TRUE  OR  j.is_hidden = TRUE)
        END
    AND (p_query IS NULL OR p_query = ''
         OR to_tsvector('english',
              coalesce(e.title,'') || ' ' || coalesce(e.content::TEXT,''))
            @@ plainto_tsquery('english', p_query))
    AND (p_journal_id IS NULL OR e.journal_id = p_journal_id)
    AND (p_from   IS NULL OR e.entry_date >= p_from)
    AND (p_to     IS NULL OR e.entry_date <= p_to)
    AND (p_pinned IS NULL OR e.is_pinned   = p_pinned)
    AND (p_tag_ids IS NULL OR EXISTS (
          SELECT 1 FROM entry_tags et
           WHERE et.entry_id = e.entry_id AND et.tag_id = ANY(p_tag_ids)))
  ORDER BY e.is_pinned DESC, e.entry_date DESC
  LIMIT 20;
END;
$$;
