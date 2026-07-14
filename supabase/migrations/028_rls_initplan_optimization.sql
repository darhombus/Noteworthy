-- ============================================================
-- Noteworthy - RLS initplan optimization for auth predicates
-- Migration: 028_rls_initplan_optimization.sql
-- ============================================================
-- Why:
-- Supabase's advisor flagged every policy that calls auth.uid() directly.
-- In Postgres RLS, plain `auth.uid()` can be re-evaluated per row; wrapping
-- with `(select auth.uid())` promotes it to an initplan and avoids repeated
-- function execution inside table scans.
--
-- This migration preserves the same authorization semantics while reducing
-- policy overhead on large tables and nested policy checks.
-- ============================================================

-- profiles ----------------------------------------------------
DROP POLICY IF EXISTS "profiles: select own" ON profiles;
CREATE POLICY "profiles: select own"
  ON profiles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "profiles: insert own" ON profiles;
CREATE POLICY "profiles: insert own"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "profiles: update own" ON profiles;
CREATE POLICY "profiles: update own"
  ON profiles FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- journals ----------------------------------------------------
DROP POLICY IF EXISTS "journals: select own" ON journals;
CREATE POLICY "journals: select own"
  ON journals FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "journals: insert own" ON journals;
CREATE POLICY "journals: insert own"
  ON journals FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "journals: update own" ON journals;
CREATE POLICY "journals: update own"
  ON journals FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "journals: delete own" ON journals;
CREATE POLICY "journals: delete own"
  ON journals FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- entries -----------------------------------------------------
DROP POLICY IF EXISTS "entries: select own" ON entries;
CREATE POLICY "entries: select own"
  ON entries FOR SELECT TO authenticated
  USING (
    journal_id IN (
      SELECT journal_id
      FROM journals
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "entries: insert own" ON entries;
CREATE POLICY "entries: insert own"
  ON entries FOR INSERT TO authenticated
  WITH CHECK (
    journal_id IN (
      SELECT journal_id
      FROM journals
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "entries: update own" ON entries;
CREATE POLICY "entries: update own"
  ON entries FOR UPDATE TO authenticated
  USING (
    journal_id IN (
      SELECT journal_id
      FROM journals
      WHERE user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    journal_id IN (
      SELECT journal_id
      FROM journals
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "entries: delete own" ON entries;
CREATE POLICY "entries: delete own"
  ON entries FOR DELETE TO authenticated
  USING (
    journal_id IN (
      SELECT journal_id
      FROM journals
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- tags --------------------------------------------------------
DROP POLICY IF EXISTS "tags: select own" ON tags;
CREATE POLICY "tags: select own"
  ON tags FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "tags: insert own" ON tags;
CREATE POLICY "tags: insert own"
  ON tags FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "tags: update own" ON tags;
CREATE POLICY "tags: update own"
  ON tags FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "tags: delete own" ON tags;
CREATE POLICY "tags: delete own"
  ON tags FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- entry_tags --------------------------------------------------
DROP POLICY IF EXISTS "entry_tags: select own" ON entry_tags;
CREATE POLICY "entry_tags: select own"
  ON entry_tags FOR SELECT TO authenticated
  USING (
    entry_id IN (
      SELECT e.entry_id
      FROM entries e
      WHERE e.journal_id IN (
        SELECT j.journal_id
        FROM journals j
        WHERE j.user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "entry_tags: insert own" ON entry_tags;
CREATE POLICY "entry_tags: insert own"
  ON entry_tags FOR INSERT TO authenticated
  WITH CHECK (
    entry_id IN (
      SELECT e.entry_id
      FROM entries e
      WHERE e.journal_id IN (
        SELECT j.journal_id
        FROM journals j
        WHERE j.user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "entry_tags: delete own" ON entry_tags;
CREATE POLICY "entry_tags: delete own"
  ON entry_tags FOR DELETE TO authenticated
  USING (
    entry_id IN (
      SELECT e.entry_id
      FROM entries e
      WHERE e.journal_id IN (
        SELECT j.journal_id
        FROM journals j
        WHERE j.user_id = (SELECT auth.uid())
      )
    )
  );

-- media -------------------------------------------------------
DROP POLICY IF EXISTS "media: select own" ON media;
CREATE POLICY "media: select own"
  ON media FOR SELECT TO authenticated
  USING (
    entry_id IN (
      SELECT e.entry_id
      FROM entries e
      WHERE e.journal_id IN (
        SELECT j.journal_id
        FROM journals j
        WHERE j.user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "media: insert own" ON media;
CREATE POLICY "media: insert own"
  ON media FOR INSERT TO authenticated
  WITH CHECK (
    entry_id IN (
      SELECT e.entry_id
      FROM entries e
      WHERE e.journal_id IN (
        SELECT j.journal_id
        FROM journals j
        WHERE j.user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "media: delete own" ON media;
CREATE POLICY "media: delete own"
  ON media FOR DELETE TO authenticated
  USING (
    entry_id IN (
      SELECT e.entry_id
      FROM entries e
      WHERE e.journal_id IN (
        SELECT j.journal_id
        FROM journals j
        WHERE j.user_id = (SELECT auth.uid())
      )
    )
  );
