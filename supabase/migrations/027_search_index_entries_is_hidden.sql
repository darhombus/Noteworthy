-- ============================================================
-- Noteworthy — surface entries.is_hidden from the search index RPC
-- Migration: 027_search_index_entries_is_hidden.sql
-- ============================================================
-- The Cmd+K overlay's "individually hidden" asterisk is meant to mark
-- entries where BOTH entries.is_hidden and journals.is_hidden are
-- true — so the user knows the entry will stay hidden even after a
-- journal unhide. The snapshot RPC was returning only
-- journal_is_hidden, so the overlay had to guess and ended up showing
-- the asterisk on standalone-hidden entries (entry hidden, journal
-- public) which is the opposite of the intended semantic.
--
-- Add entries.is_hidden to the return shape so the overlay can apply
-- the correct two-flag condition without a follow-up query.
--
-- DROP first because RETURN TABLE shape is part of the function's
-- PostgREST signature — see memory:
-- feedback_postgres_function_signature_change.md
-- ============================================================

DROP FUNCTION IF EXISTS search_index_entries(UUID, TEXT);

CREATE OR REPLACE FUNCTION search_index_entries(
  p_user_id UUID,
  p_scope   TEXT
)
RETURNS TABLE (
  entry_id          UUID,
  title             TEXT,
  journal_id        UUID,
  journal_title     TEXT,
  journal_color     TEXT,
  journal_is_hidden BOOLEAN,
  entry_is_hidden   BOOLEAN,
  entry_date        DATE,
  word_count        INT,
  is_pinned         BOOLEAN,
  is_favorite       BOOLEAN,
  search_text       TEXT,
  tags              JSONB
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
    j.title  AS journal_title,
    j.color  AS journal_color,
    j.is_hidden AS journal_is_hidden,
    e.is_hidden AS entry_is_hidden,
    e.entry_date,
    e.word_count,
    e.is_pinned,
    e.is_favorite,
    e.search_text,
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
  ORDER BY e.is_pinned DESC, e.entry_date DESC;
END;
$$;
