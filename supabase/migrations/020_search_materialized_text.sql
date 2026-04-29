-- ============================================================
-- Noteworthy — materialize search text for fast as-you-type search
-- Migration: 020_search_materialized_text.sql
-- ============================================================
-- The 016/019 search_entries() calls extract_tiptap_text(e.content)
-- THREE times per row touched: once in the FTS predicate, once in the
-- ILIKE fallback, and once in the SELECT for the snippet. The FTS GIN
-- and trigram GIN indexes from 017 cover the predicate branches when
-- the planner picks them, but the snippet always walks the full JSONB
-- doc per result row, which dominates query time on entries with
-- long content. That's the real source of the "as-you-type loading
-- pause" — index lookups are fast, the per-row JSONB walk for
-- snippet generation is not.
--
-- Migration 003 returned the raw content JSONB and skipped that walk
-- on the server entirely; that's what made it feel snappy back when
-- the data set was small. The same shape is impossible now (we ship
-- snippets to multiple clients and don't want to round-trip whole
-- Tiptap documents), so instead we materialize the rendered plain
-- text per row into a generated STORED column. The column is updated
-- automatically on every insert/update because extract_tiptap_text()
-- is IMMUTABLE; both GIN indexes get rebuilt on the column expression
-- so the planner has tight, sargable predicates; and the snippet
-- becomes a literal LEFT(search_text, 200) — no JSONB walk at all.
--
-- search_entries() signature is unchanged → CREATE OR REPLACE is
-- enough (per memory: feedback_postgres_function_signature_change.md).
-- ============================================================

-- Tighten extract_tiptap_text against NULL inputs. The column adds
-- below evaluates this for every existing row, including any pre-014
-- stragglers, so a raw NULL must not blow up.
CREATE OR REPLACE FUNCTION extract_tiptap_text(doc JSONB)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT coalesce(
    string_agg(elem ->> 'text', ' '),
    ''
  )
  FROM jsonb_path_query(coalesce(doc, '{}'::jsonb), '$.** ? (@.type == "text")') AS elem;
$$;

-- The 017 indexes are computed on the inline expression
-- (coalesce(title,'') || ' ' || extract_tiptap_text(content)). When
-- we replace that with a generated column the inline expression no
-- longer matches the indexes, so drop them first and rebuild against
-- the new column.
DROP INDEX IF EXISTS fts_entries;
DROP INDEX IF EXISTS trgm_entries_search;

ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS search_text TEXT
  GENERATED ALWAYS AS (
    coalesce(title, '') || ' ' || extract_tiptap_text(content)
  ) STORED;

CREATE INDEX fts_entries ON entries
  USING gin(to_tsvector('english', search_text));

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX trgm_entries_search ON entries
  USING gin(lower(search_text) gin_trgm_ops);

CREATE OR REPLACE FUNCTION search_entries(
  p_user_id    UUID,
  p_query      TEXT,
  p_scope      TEXT,
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
  is_pinned     BOOLEAN,
  snippet       TEXT
)
LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
  q_tsq   tsquery := build_prefix_tsquery(p_query);
  q_like  TEXT    := '%' || lower(coalesce(p_query, '')) || '%';
  q_empty BOOLEAN := coalesce(p_query, '') = '';
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
    e.is_pinned,
    LEFT(e.search_text, 200) AS snippet
  FROM entries  e
  JOIN journals j ON j.journal_id = e.journal_id
  WHERE j.user_id    = p_user_id
    AND e.deleted_at IS NULL
    AND j.deleted_at IS NULL
    AND CASE p_scope
          WHEN 'public' THEN (e.is_hidden = FALSE AND j.is_hidden = FALSE)
          WHEN 'hidden' THEN (e.is_hidden = TRUE  OR  j.is_hidden = TRUE)
        END
    AND (
      q_empty
      OR (q_tsq IS NOT NULL
          AND to_tsvector('english', e.search_text) @@ q_tsq)
      OR lower(e.search_text) LIKE q_like
    )
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
