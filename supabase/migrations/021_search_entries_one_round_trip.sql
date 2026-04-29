-- ============================================================
-- Noteworthy — search_entries returns tags + journal_is_hidden in one call
-- Migration: 021_search_entries_one_round_trip.sql
-- ============================================================
-- /api/search currently makes FIVE database round trips per keystroke:
--   1. search_entries() RPC
--   2. journals.ilike(title)
--   3. journals.ilike(description)
--   4. entry_tags lookup for the matched entries
--   5. journals.is_hidden lookup for the matched entries' parents
--
-- Combined with the duplicated supabase.auth.getUser() call (proxy.ts
-- already validates), every keystroke pays well over half a second of
-- pure round-trip overhead from a remote dev machine. The DB itself is
-- fast (migration 020 materialized the search_text column with both GIN
-- indexes); the cost is the wire.
--
-- Fold the per-row entry_tags lookup AND the parent journal's is_hidden
-- flag directly into search_entries(). Result: only journal title +
-- description matching remains as a separate query, and the route can
-- collapse those into one .or() call → two DB round trips total.
--
-- The return type gains two columns (journal_is_hidden, tags), so per
-- the project's feedback_postgres_function_signature_change memo we DROP
-- the old overload first before recreating.
-- ============================================================

DROP FUNCTION IF EXISTS search_entries(UUID, TEXT, TEXT, UUID, DATE, DATE, BOOLEAN, UUID[]);

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
  entry_id          UUID,
  title             TEXT,
  journal_id        UUID,
  journal_title     TEXT,
  journal_color     TEXT,
  journal_is_hidden BOOLEAN,
  entry_date        DATE,
  word_count        INT,
  is_pinned         BOOLEAN,
  snippet           TEXT,
  tags              JSONB
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
    j.title  AS journal_title,
    j.color  AS journal_color,
    j.is_hidden AS journal_is_hidden,
    e.entry_date,
    e.word_count,
    e.is_pinned,
    LEFT(e.search_text, 200) AS snippet,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
                'tag_id',   t.tag_id,
                'tag_name', t.tag_name,
                'color',    t.color))
       FROM entry_tags et
       JOIN tags t ON t.tag_id = et.tag_id
       WHERE et.entry_id = e.entry_id),
      '[]'::jsonb
    ) AS tags
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
