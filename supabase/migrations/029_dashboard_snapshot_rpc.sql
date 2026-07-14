-- ============================================================
-- Noteworthy - Dashboard snapshot RPC + supporting indexes
-- Migration: 029_dashboard_snapshot_rpc.sql
-- ============================================================
-- Why:
-- The dashboard previously issued multiple round trips and transferred a
-- large row set to the app just to compute aggregates in TypeScript.
-- This RPC computes all dashboard metrics server-side in one call.
-- ============================================================

-- Recent entries card sorts by created_at DESC on public entries.
CREATE INDEX IF NOT EXISTS idx_entries_journal_public_created
  ON entries (journal_id, created_at DESC)
  WHERE is_hidden = FALSE AND deleted_at IS NULL;

-- Top-tag query shape: user_id + usage_count desc, filtered to > 0.
CREATE INDEX IF NOT EXISTS idx_tags_user_usage_desc
  ON tags (user_id, usage_count DESC)
  WHERE usage_count > 0;

CREATE OR REPLACE FUNCTION public.get_dashboard_snapshot()
RETURNS TABLE (
  total_entries   INTEGER,
  this_month      INTEGER,
  this_week       INTEGER,
  current_streak  INTEGER,
  best_streak     INTEGER,
  top_tag         TEXT,
  week_counts     INTEGER[],
  recent_entries  JSONB
)
LANGUAGE sql
STABLE
AS $$
  WITH me AS (
    SELECT (SELECT auth.uid()) AS uid
  ),
  week_bounds AS (
    SELECT
      (CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::INT)::DATE AS week_start,
      (CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::INT + 6)::DATE AS week_end
  ),
  visible_entries AS (
    SELECT
      e.entry_id,
      e.journal_id,
      e.title,
      e.entry_date,
      e.word_count,
      e.created_at,
      j.title AS journal_title,
      j.color AS journal_color
    FROM entries e
    JOIN journals j
      ON j.journal_id = e.journal_id
    JOIN me
      ON j.user_id = me.uid
    WHERE e.is_hidden = FALSE
      AND e.deleted_at IS NULL
      AND j.is_hidden = FALSE
      AND j.deleted_at IS NULL
  ),
  stats AS (
    SELECT
      COUNT(*)::INT AS total_entries,
      COUNT(*) FILTER (
        WHERE entry_date >= DATE_TRUNC('month', CURRENT_DATE)::DATE
      )::INT AS this_month,
      COUNT(*) FILTER (
        WHERE entry_date BETWEEN
          (SELECT week_start FROM week_bounds)
          AND
          (SELECT week_end FROM week_bounds)
      )::INT AS this_week
    FROM visible_entries
  ),
  distinct_days AS (
    SELECT DISTINCT entry_date
    FROM visible_entries
  ),
  streak_runs AS (
    SELECT
      MIN(entry_date) AS start_date,
      MAX(entry_date) AS end_date,
      COUNT(*)::INT AS run_len
    FROM (
      SELECT
        entry_date,
        (entry_date - (ROW_NUMBER() OVER (ORDER BY entry_date))::INT)::DATE AS grp
      FROM distinct_days
    ) d
    GROUP BY grp
  ),
  streaks AS (
    SELECT
      COALESCE(MAX(run_len), 0)::INT AS best_streak,
      COALESCE(
        (
          SELECT run_len
          FROM streak_runs
          WHERE end_date IN (CURRENT_DATE, CURRENT_DATE - 1)
          ORDER BY end_date DESC
          LIMIT 1
        ),
        0
      )::INT AS current_streak
    FROM streak_runs
  ),
  week_counts_cte AS (
    SELECT
      COALESCE(
        ARRAY_AGG(COALESCE(c.cnt, 0)::INT ORDER BY s.day),
        ARRAY[]::INTEGER[]
      ) AS week_counts
    FROM (
      SELECT GENERATE_SERIES(
        (SELECT week_start FROM week_bounds),
        (SELECT week_end FROM week_bounds),
        INTERVAL '1 day'
      )::DATE AS day
    ) s
    LEFT JOIN (
      SELECT entry_date, COUNT(*)::INT AS cnt
      FROM visible_entries
      WHERE entry_date BETWEEN
        (SELECT week_start FROM week_bounds)
        AND
        (SELECT week_end FROM week_bounds)
      GROUP BY entry_date
    ) c
      ON c.entry_date = s.day
  ),
  recent AS (
    SELECT
      COALESCE(
        JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'entryId', r.entry_id,
            'title', r.title,
            'entryDate', r.entry_date,
            'wordCount', r.word_count,
            'journalId', r.journal_id,
            'journalTitle', r.journal_title,
            'journalColor', r.journal_color
          )
          ORDER BY r.created_at DESC
        ),
        '[]'::JSONB
      ) AS recent_entries
    FROM (
      SELECT
        entry_id,
        title,
        entry_date,
        word_count,
        journal_id,
        journal_title,
        journal_color,
        created_at
      FROM visible_entries
      ORDER BY created_at DESC
      LIMIT 5
    ) r
  ),
  top_tag_cte AS (
    SELECT (
      SELECT t.tag_name
      FROM tags t
      JOIN me ON t.user_id = me.uid
      WHERE t.usage_count > 0
      ORDER BY t.usage_count DESC
      LIMIT 1
    ) AS top_tag
  )
  SELECT
    stats.total_entries,
    stats.this_month,
    stats.this_week,
    streaks.current_streak,
    streaks.best_streak,
    top_tag_cte.top_tag,
    week_counts_cte.week_counts,
    recent.recent_entries
  FROM stats
  CROSS JOIN streaks
  CROSS JOIN week_counts_cte
  CROSS JOIN recent
  CROSS JOIN top_tag_cte;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_snapshot() TO authenticated;
