-- ============================================================
-- Noteworthy — search index RPC for client-side global search
-- Migration: 022_search_index_rpc.sql
-- ============================================================
-- The global Cmd+K overlay was still fetching per keystroke. Even with
-- migration 021 collapsing it to two round trips, every keystroke still
-- pays ~100–250ms of wire latency from a remote dev machine, which
-- shows up as a spinner-then-jolt glitch as the user types.
--
-- The cure used in EntryList — filter a snapshot client-side — needs a
-- snapshot the overlay can prefetch when it opens. This RPC returns
-- every entry visible on the requested surface in a single call:
-- `search_text` for the haystack (already materialized in 020), parent
-- journal info for the result row, and tags as a JSONB aggregate so
-- there's no follow-up query.
--
-- No LIMIT — the overlay needs the full visible set. Personal-journal
-- workloads stay well within payload sane-bounds (~1KB/entry typical),
-- and the column reads off a generated stored column so no per-row
-- JSONB walk happens here either.
-- ============================================================

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
  entry_date        DATE,
  word_count        INT,
  is_pinned         BOOLEAN,
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
    e.entry_date,
    e.word_count,
    e.is_pinned,
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
