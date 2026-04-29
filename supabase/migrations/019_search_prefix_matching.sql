-- ============================================================
-- Noteworthy — fast as-you-type search via prefix-matching tsquery
-- Migration: 019_search_prefix_matching.sql
-- ============================================================
-- Migration 003 added an ILIKE fallback so partial words match while
-- the user types ("lov" → "loving"). That worked, but the ILIKE branch
-- has to scan the rendered text per row even with the trigram index
-- from migration 017 — the planner can't always pick the trgm GIN for
-- 1- and 2-character queries, and even when it does, a partial-prefix
-- LIKE is heavier than a tsquery prefix match.
--
-- Switch the primary text predicate to a prefix-matching tsquery, e.g.
-- the user typing "lov" becomes the tsquery `lov:*`, which is matched
-- by the same GIN index that already serves full-word FTS (migration
-- 017's `fts_entries`). The ILIKE branch stays as a final fallback for
-- substring matches inside words ("ovi" inside "loving") and for
-- non-English text the FTS dictionary doesn't stem.
--
-- The signature of search_entries() is unchanged, so CREATE OR REPLACE
-- is enough — no DROP needed (per memory:
-- feedback_postgres_function_signature_change.md).
-- ============================================================

-- Build a prefix-matching tsquery from raw user input. Strips every
-- character that has meaning in tsquery syntax (`&`, `|`, `!`, `(`,
-- `)`, `:`, `*`, `<`, `>`, quotes, etc.) so user input can never
-- corrupt the parsed tsquery, then appends `:*` to each remaining
-- word so partial words match via the FTS GIN index.
--
-- Returns NULL when the input has no usable terms; callers must treat
-- that as "no FTS predicate, fall back to ILIKE".
CREATE OR REPLACE FUNCTION build_prefix_tsquery(p_query TEXT)
RETURNS tsquery
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  cleaned TEXT;
  words   TEXT[];
  term    TEXT;
  parts   TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF p_query IS NULL OR trim(p_query) = '' THEN
    RETURN NULL::tsquery;
  END IF;

  cleaned := regexp_replace(lower(p_query), '[^a-z0-9 ]+', ' ', 'g');
  words   := regexp_split_to_array(trim(cleaned), '\s+');

  FOREACH term IN ARRAY words LOOP
    IF length(term) > 0 THEN
      parts := array_append(parts, term || ':*');
    END IF;
  END LOOP;

  IF cardinality(parts) = 0 THEN
    RETURN NULL::tsquery;
  END IF;

  RETURN to_tsquery('english', array_to_string(parts, ' & '));
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL::tsquery;
END;
$$;

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
    AND (
      q_empty
      OR (q_tsq IS NOT NULL
          AND to_tsvector('english',
                coalesce(e.title, '') || ' ' || extract_tiptap_text(e.content))
              @@ q_tsq)
      OR lower(coalesce(e.title, '') || ' ' || extract_tiptap_text(e.content))
           LIKE q_like
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
