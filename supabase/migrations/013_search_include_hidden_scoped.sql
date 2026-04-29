-- ============================================================
-- Noteworthy — Allow scoped search inside a hidden journal
-- Migration: 013_search_include_hidden_scoped.sql
-- ============================================================
-- Adds `p_include_hidden BOOLEAN` to search_entries. When TRUE the
-- function skips the is_hidden filters added in 012, letting the
-- /api/search route surface entries inside a hidden journal once the
-- caller has proven the Privacy Vault is open and owns that journal.
-- The default stays FALSE so global search continues to exclude
-- hidden items.
--
-- IMPORTANT: adding a parameter changes the function signature, so
-- CREATE OR REPLACE creates an *overload* instead of replacing the
-- 6-arg version from 012. PostgREST then can't pick between them and
-- every search 4xx's. Drop the old signature first.
-- ============================================================

DROP FUNCTION IF EXISTS search_entries(TEXT, UUID, DATE, DATE, BOOLEAN, UUID[]);

CREATE OR REPLACE FUNCTION search_entries(
  p_query          TEXT,
  p_journal_id     UUID    DEFAULT NULL,
  p_from           DATE    DEFAULT NULL,
  p_to             DATE    DEFAULT NULL,
  p_pinned         BOOLEAN DEFAULT NULL,
  p_tag_ids        UUID[]  DEFAULT NULL,
  p_include_hidden BOOLEAN DEFAULT FALSE
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
  content       JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.entry_id,
    e.title,
    e.journal_id,
    j.title     AS journal_title,
    j.color     AS journal_color,
    e.entry_date,
    e.word_count,
    e.is_pinned,
    e.content
  FROM  entries  e
  JOIN  journals j ON j.journal_id = e.journal_id
  CROSS JOIN LATERAL (
    SELECT coalesce(e.title, '') || ' ' || extract_tiptap_text(e.content) AS full_text
  ) ft
  WHERE j.user_id    = auth.uid()
    AND e.deleted_at IS NULL
    AND j.deleted_at IS NULL
    AND (p_include_hidden OR e.is_hidden = FALSE)
    AND (p_include_hidden OR j.is_hidden = FALSE)
    AND (
      to_tsvector('english', ft.full_text) @@ plainto_tsquery('english', p_query)
      OR lower(ft.full_text) LIKE '%' || lower(p_query) || '%'
    )
    AND (p_journal_id IS NULL OR e.journal_id = p_journal_id)
    AND (p_from       IS NULL OR e.entry_date >= p_from)
    AND (p_to         IS NULL OR e.entry_date <= p_to)
    AND (p_pinned     IS NULL OR e.is_pinned  = p_pinned)
    AND (
      p_tag_ids IS NULL
      OR e.entry_id IN (
           SELECT et.entry_id
           FROM   entry_tags et
           WHERE  et.tag_id = ANY(p_tag_ids)
           GROUP  BY et.entry_id
           HAVING COUNT(DISTINCT et.tag_id) = array_length(p_tag_ids, 1)
         )
    )
  ORDER BY e.entry_date DESC
  LIMIT 20;
END;
$$;
