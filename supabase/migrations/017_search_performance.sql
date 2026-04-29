-- ============================================================
-- Noteworthy — search performance
-- Migration: 017_search_performance.sql
-- ============================================================
-- Two fixes for slow content search:
--
-- 1. The original FTS index (migration 001) was built on
--      to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content::text,''))
--    but search_entries() (migration 016) queries against
--      to_tsvector('english', coalesce(title,'') || ' ' || extract_tiptap_text(content))
--    Different expressions → planner ignored the index → sequential
--    scan + extract_tiptap_text() per row. On a journal with several
--    hundred entries the global search overlay took multiple seconds
--    even for short queries.
--
-- 2. The ILIKE fallback that lets typing "lov" match "loving" was
--    unindexed, so it always forced a sequential scan with a per-row
--    JSONB walk regardless of whether the FTS branch could short-
--    circuit it.
--
-- Fix: rebuild the FTS index against the same expression used at query
-- time, and add a pg_trgm GIN index for the ILIKE branch. Both indexes
-- now use IMMUTABLE expressions identical to the ones in
-- search_entries(), so PostgreSQL can match them at plan time.
-- ============================================================

DROP INDEX IF EXISTS fts_entries;

CREATE INDEX fts_entries ON entries
  USING gin(to_tsvector('english',
    coalesce(title, '') || ' ' || extract_tiptap_text(content)));

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX trgm_entries_search ON entries
  USING gin(
    (lower(coalesce(title, '') || ' ' || extract_tiptap_text(content)))
    gin_trgm_ops
  );
