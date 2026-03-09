-- ============================================================
-- Noteworthy — Initial Schema
-- Migration: 001_initial_schema.sql
-- ============================================================


-- ============================================================
-- TABLES
-- ============================================================

-- profiles
CREATE TABLE profiles (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL DEFAULT '',
  avatar_url  TEXT,
  preferences JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: select own"
  ON profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "profiles: insert own"
  ON profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "profiles: update own"
  ON profiles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- journals
CREATE TABLE journals (
  journal_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  color            TEXT NOT NULL DEFAULT '#1A56DB',
  icon             TEXT NOT NULL DEFAULT 'book',
  is_favorite      BOOLEAN NOT NULL DEFAULT FALSE,
  entry_count      INT NOT NULL DEFAULT 0,
  total_word_count INT NOT NULL DEFAULT 0,
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE journals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journals: select own"
  ON journals FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "journals: insert own"
  ON journals FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "journals: update own"
  ON journals FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "journals: delete own"
  ON journals FOR DELETE
  USING (user_id = auth.uid());


-- entries
CREATE TABLE entries (
  entry_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id  UUID NOT NULL REFERENCES journals(journal_id) ON DELETE CASCADE,
  title       TEXT,
  content     JSONB NOT NULL DEFAULT '[]',
  word_count  INT NOT NULL DEFAULT 0,
  is_pinned   BOOLEAN NOT NULL DEFAULT FALSE,
  entry_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entries: select own"
  ON entries FOR SELECT
  USING (
    journal_id IN (
      SELECT journal_id FROM journals WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "entries: insert own"
  ON entries FOR INSERT
  WITH CHECK (
    journal_id IN (
      SELECT journal_id FROM journals WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "entries: update own"
  ON entries FOR UPDATE
  USING (
    journal_id IN (
      SELECT journal_id FROM journals WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    journal_id IN (
      SELECT journal_id FROM journals WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "entries: delete own"
  ON entries FOR DELETE
  USING (
    journal_id IN (
      SELECT journal_id FROM journals WHERE user_id = auth.uid()
    )
  );


-- tags
CREATE TABLE tags (
  tag_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag_name   TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#1A56DB',
  usage_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, tag_name)
);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tags: select own"
  ON tags FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "tags: insert own"
  ON tags FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "tags: update own"
  ON tags FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "tags: delete own"
  ON tags FOR DELETE
  USING (user_id = auth.uid());


-- entry_tags
CREATE TABLE entry_tags (
  entry_id  UUID NOT NULL REFERENCES entries(entry_id) ON DELETE CASCADE,
  tag_id    UUID NOT NULL REFERENCES tags(tag_id) ON DELETE CASCADE,
  tagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entry_id, tag_id)
);

ALTER TABLE entry_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entry_tags: select own"
  ON entry_tags FOR SELECT
  USING (
    entry_id IN (
      SELECT entry_id FROM entries
      WHERE journal_id IN (
        SELECT journal_id FROM journals WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "entry_tags: insert own"
  ON entry_tags FOR INSERT
  WITH CHECK (
    entry_id IN (
      SELECT entry_id FROM entries
      WHERE journal_id IN (
        SELECT journal_id FROM journals WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "entry_tags: delete own"
  ON entry_tags FOR DELETE
  USING (
    entry_id IN (
      SELECT entry_id FROM entries
      WHERE journal_id IN (
        SELECT journal_id FROM journals WHERE user_id = auth.uid()
      )
    )
  );


-- media
CREATE TABLE media (
  media_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id    UUID NOT NULL REFERENCES entries(entry_id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL,
  file_url    TEXT NOT NULL,
  file_type   TEXT NOT NULL,
  file_size   BIGINT NOT NULL,
  mime_type   TEXT NOT NULL,
  width       INT,
  height      INT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "media: select own"
  ON media FOR SELECT
  USING (
    entry_id IN (
      SELECT entry_id FROM entries
      WHERE journal_id IN (
        SELECT journal_id FROM journals WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "media: insert own"
  ON media FOR INSERT
  WITH CHECK (
    entry_id IN (
      SELECT entry_id FROM entries
      WHERE journal_id IN (
        SELECT journal_id FROM journals WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "media: delete own"
  ON media FOR DELETE
  USING (
    entry_id IN (
      SELECT entry_id FROM entries
      WHERE journal_id IN (
        SELECT journal_id FROM journals WHERE user_id = auth.uid()
      )
    )
  );


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_entries_journal_id   ON entries(journal_id);
CREATE INDEX idx_entries_entry_date   ON entries(entry_date);
CREATE INDEX idx_entries_journal_date ON entries(journal_id, entry_date DESC);
CREATE INDEX idx_entry_tags_entry_id  ON entry_tags(entry_id);
CREATE INDEX idx_entry_tags_tag_id    ON entry_tags(tag_id);

CREATE INDEX idx_entries_deleted ON entries(deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX idx_journals_deleted ON journals(deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX fts_entries ON entries
  USING gin(to_tsvector('english',
    coalesce(title, '') || ' ' || coalesce(content::text, '')));


-- ============================================================
-- TRIGGER FUNCTIONS
-- ============================================================

-- 1. updated_at auto-stamp
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_journals_updated_at
  BEFORE UPDATE ON journals
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_entries_updated_at
  BEFORE UPDATE ON entries
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();


-- 2. entries word_count — extract all string values from JSONB content recursively
CREATE OR REPLACE FUNCTION fn_compute_word_count(content JSONB)
RETURNS INT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  raw_text TEXT;
BEGIN
  SELECT string_agg(val, ' ')
  INTO raw_text
  FROM jsonb_path_query(content, 'strict $.**.text') AS val;

  IF raw_text IS NULL OR raw_text = '' THEN
    RETURN 0;
  END IF;

  RETURN array_length(
    array_remove(
      regexp_split_to_array(trim(raw_text::text), '\s+'),
      ''
    ),
    1
  );
END;
$$;

CREATE OR REPLACE FUNCTION fn_entries_word_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.word_count = fn_compute_word_count(NEW.content);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_entries_word_count
  BEFORE INSERT OR UPDATE OF content ON entries
  FOR EACH ROW EXECUTE FUNCTION fn_entries_word_count();


-- 3. journals entry_count + total_word_count rollup
CREATE OR REPLACE FUNCTION fn_journals_rollup()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  target_journal_id UUID;
BEGIN
  -- Determine which journal to update
  IF TG_OP = 'DELETE' THEN
    target_journal_id = OLD.journal_id;
  ELSE
    target_journal_id = NEW.journal_id;
  END IF;

  UPDATE journals
  SET
    entry_count      = (
      SELECT COUNT(*)
      FROM entries
      WHERE journal_id = target_journal_id
        AND deleted_at IS NULL
    ),
    total_word_count = (
      SELECT COALESCE(SUM(word_count), 0)
      FROM entries
      WHERE journal_id = target_journal_id
        AND deleted_at IS NULL
    )
  WHERE journal_id = target_journal_id;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_journals_rollup_insert
  AFTER INSERT ON entries
  FOR EACH ROW EXECUTE FUNCTION fn_journals_rollup();

CREATE TRIGGER trg_journals_rollup_update
  AFTER UPDATE OF deleted_at, word_count ON entries
  FOR EACH ROW EXECUTE FUNCTION fn_journals_rollup();

CREATE TRIGGER trg_journals_rollup_delete
  AFTER DELETE ON entries
  FOR EACH ROW EXECUTE FUNCTION fn_journals_rollup();


-- 4. tags usage_count rollup
CREATE OR REPLACE FUNCTION fn_tags_usage_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  target_tag_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_tag_id = OLD.tag_id;
  ELSE
    target_tag_id = NEW.tag_id;
  END IF;

  UPDATE tags
  SET usage_count = (
    SELECT COUNT(*) FROM entry_tags WHERE tag_id = target_tag_id
  )
  WHERE tag_id = target_tag_id;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_tags_usage_insert
  AFTER INSERT ON entry_tags
  FOR EACH ROW EXECUTE FUNCTION fn_tags_usage_count();

CREATE TRIGGER trg_tags_usage_delete
  AFTER DELETE ON entry_tags
  FOR EACH ROW EXECUTE FUNCTION fn_tags_usage_count();


-- ============================================================
-- PG_CRON — PURGE SOFT-DELETED ROWS OLDER THAN 30 DAYS
-- ============================================================

SELECT cron.schedule('purge-deleted', '0 3 * * *', $$
  DELETE FROM entries WHERE deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM journals WHERE deleted_at < NOW() - INTERVAL '30 days';
$$);
