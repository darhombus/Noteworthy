-- ============================================================
-- Noteworthy — search_entries: extract plain text from Tiptap JSONB
-- Migration: 016_search_entries_plain_text.sql
-- ============================================================
-- Migrations 014/015 left search_entries() generating snippets via
-- e.content::TEXT, which dumps the raw Tiptap JSONB into the result.
-- That made the search overlay render JSON like
--   {"type":"doc","content":[…]}
-- instead of the actual entry copy. The same cast was used inside the
-- to_tsvector() FTS predicate, which hurt match quality (ranking words
-- like "type" and "text" that only ever appear as JSON keys).
--
-- Use extract_tiptap_text(), defined in migration 003, which walks the
-- doc and joins every text node. That gives clean snippets and
-- searches the user's actual writing.
--
-- Adding/removing parameters or changing the body alone doesn't change
-- the signature, so CREATE OR REPLACE is enough — no DROP needed.
-- ============================================================

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
  is_pinned     BOOLEAN,
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
    e.is_pinned,
    LEFT(coalesce(e.title, '') || ' ' || extract_tiptap_text(e.content), 200) AS snippet
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
              coalesce(e.title, '') || ' ' || extract_tiptap_text(e.content))
            @@ plainto_tsquery('english', p_query)
         OR lower(coalesce(e.title, '') || ' ' || extract_tiptap_text(e.content))
              LIKE '%' || lower(p_query) || '%')
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
