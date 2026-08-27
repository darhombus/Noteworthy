


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."build_prefix_tsquery"("p_query" "text") RETURNS "tsquery"
    LANGUAGE "plpgsql" IMMUTABLE
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


ALTER FUNCTION "public"."build_prefix_tsquery"("p_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."extract_tiptap_text"("doc" "jsonb") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $_$
  SELECT coalesce(
    string_agg(elem ->> 'text', ' '),
    ''
  )
  FROM jsonb_path_query(coalesce(doc, '{}'::jsonb), '$.** ? (@.type == "text")') AS elem;
$_$;


ALTER FUNCTION "public"."extract_tiptap_text"("doc" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_compute_word_count"("content" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    AS $_$
DECLARE
  raw_text TEXT;
BEGIN
  -- Use strict mode + silent=true so structural errors on non-objects are
  -- suppressed without triggering lax mode's array auto-unwrapping.
  -- The filter ? (@.type == "text") targets only Tiptap text nodes, so each
  -- text node is visited exactly once (no doubling from array + element).
  -- val #>> '{}' extracts the bare string value without JSON quotes.
  SELECT string_agg(val #>> '{}', ' ')
  INTO raw_text
  FROM jsonb_path_query(
    content,
    'strict $.** ? (@.type == "text").text',
    '{}',
    true
  ) AS val;

  IF raw_text IS NULL OR raw_text = '' THEN
    RETURN 0;
  END IF;

  RETURN array_length(
    array_remove(
      regexp_split_to_array(trim(raw_text), '\s+'),
      ''
    ),
    1
  );
END;
$_$;


ALTER FUNCTION "public"."fn_compute_word_count"("content" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_entries_pinned_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_pinned THEN
      NEW.pinned_at = COALESCE(NEW.pinned_at, NOW());
    ELSE
      NEW.pinned_at = NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: only touch pinned_at when is_pinned actually flips. Leaving
  -- it alone otherwise lets the backfill below set pinned_at directly,
  -- and lets future admin scripts adjust the timestamp without the
  -- trigger fighting them.
  IF NEW.is_pinned IS DISTINCT FROM OLD.is_pinned THEN
    IF NEW.is_pinned THEN
      NEW.pinned_at = NOW();
    ELSE
      NEW.pinned_at = NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_entries_pinned_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_entries_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.title      IS DISTINCT FROM OLD.title
     OR NEW.content    IS DISTINCT FROM OLD.content
     OR NEW.entry_date IS DISTINCT FROM OLD.entry_date
  THEN
    NEW.updated_at = NOW();
  ELSE
    -- Preserve OLD.updated_at so pin/favourite/hide/soft-delete don't
    -- reorder the entry list.
    NEW.updated_at = OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_entries_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_entries_word_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.word_count = fn_compute_word_count(NEW.content);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_entries_word_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_journals_bump_from_entry_edit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Only fires when the entry's updated_at moved — fn_entries_set_updated_at
  -- restricts that to genuine edits (title/content/entry_date), so pin/
  -- favourite/hide flips automatically skip this path.
  --
  -- INSERT and DELETE flow through the existing rollup trigger, which
  -- mutates entry_count and reaches journals.updated_at via #2b above.
  IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    RETURN NULL;
  END IF;

  UPDATE journals
     SET updated_at = NOW()
   WHERE journal_id = NEW.journal_id;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."fn_journals_bump_from_entry_edit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_journals_rollup"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  target_journal_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_journal_id := OLD.journal_id;
  ELSE
    target_journal_id := NEW.journal_id;
  END IF;

  UPDATE journals
  SET
    entry_count = (
      SELECT COUNT(*)
      FROM entries
      WHERE journal_id = target_journal_id
        AND deleted_at IS NULL
        AND is_hidden  = FALSE
    ),
    total_word_count = (
      SELECT COALESCE(SUM(word_count), 0)
      FROM entries
      WHERE journal_id = target_journal_id
        AND deleted_at IS NULL
        AND is_hidden  = FALSE
    ),
    hidden_entry_count = (
      SELECT COUNT(*)
      FROM entries
      WHERE journal_id = target_journal_id
        AND deleted_at IS NULL
        AND is_hidden  = TRUE
    ),
    hidden_word_count = (
      SELECT COALESCE(SUM(word_count), 0)
      FROM entries
      WHERE journal_id = target_journal_id
        AND deleted_at IS NULL
        AND is_hidden  = TRUE
    )
  WHERE journal_id = target_journal_id;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."fn_journals_rollup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_journals_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- An upstream trigger or caller may have explicitly bumped updated_at
  -- (see fn_journals_bump_from_entry_edit below). Honour it.
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    RETURN NEW;
  END IF;

  IF NEW.title            IS DISTINCT FROM OLD.title
     OR NEW.description      IS DISTINCT FROM OLD.description
     OR NEW.color            IS DISTINCT FROM OLD.color
     OR NEW.icon             IS DISTINCT FROM OLD.icon
     OR NEW.entry_count      IS DISTINCT FROM OLD.entry_count
     OR NEW.total_word_count IS DISTINCT FROM OLD.total_word_count
  THEN
    NEW.updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_journals_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_tags_usage_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  target_tag_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_tag_id := OLD.tag_id;
  ELSE
    target_tag_id := NEW.tag_id;
  END IF;

  UPDATE tags
  SET usage_count = (
    SELECT COUNT(*)
    FROM entry_tags et
    JOIN entries  e ON e.entry_id   = et.entry_id
    JOIN journals j ON j.journal_id = e.journal_id
    WHERE et.tag_id      = target_tag_id
      AND e.deleted_at   IS NULL
      AND j.deleted_at   IS NULL
      AND e.is_hidden    = FALSE
      AND j.is_hidden    = FALSE
  )
  WHERE tag_id = target_tag_id;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."fn_tags_usage_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_tags_usage_count_for_entry"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  target_entry_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_entry_id := OLD.entry_id;
  ELSE
    target_entry_id := NEW.entry_id;
  END IF;

  UPDATE tags t
  SET usage_count = (
    SELECT COUNT(*)
    FROM entry_tags et
    JOIN entries  e ON e.entry_id   = et.entry_id
    JOIN journals j ON j.journal_id = e.journal_id
    WHERE et.tag_id      = t.tag_id
      AND e.deleted_at   IS NULL
      AND j.deleted_at   IS NULL
      AND e.is_hidden    = FALSE
      AND j.is_hidden    = FALSE
  )
  WHERE t.tag_id IN (
    SELECT tag_id FROM entry_tags WHERE entry_id = target_entry_id
  );

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."fn_tags_usage_count_for_entry"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_tags_usage_count_for_journal"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  target_journal_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_journal_id := OLD.journal_id;
  ELSE
    target_journal_id := NEW.journal_id;
  END IF;

  UPDATE tags t
  SET usage_count = (
    SELECT COUNT(*)
    FROM entry_tags et
    JOIN entries  e ON e.entry_id   = et.entry_id
    JOIN journals j ON j.journal_id = e.journal_id
    WHERE et.tag_id      = t.tag_id
      AND e.deleted_at   IS NULL
      AND j.deleted_at   IS NULL
      AND e.is_hidden    = FALSE
      AND j.is_hidden    = FALSE
  )
  WHERE t.tag_id IN (
    SELECT DISTINCT et.tag_id
    FROM entry_tags et
    JOIN entries e ON e.entry_id = et.entry_id
    WHERE e.journal_id = target_journal_id
  );

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."fn_tags_usage_count_for_journal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_snapshot"() RETURNS TABLE("total_entries" integer, "this_month" integer, "this_week" integer, "current_streak" integer, "best_streak" integer, "top_tag" "text", "week_counts" integer[], "recent_entries" "jsonb")
    LANGUAGE "sql" STABLE
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


ALTER FUNCTION "public"."get_dashboard_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_entries"("p_user_id" "uuid", "p_query" "text", "p_scope" "text", "p_journal_id" "uuid" DEFAULT NULL::"uuid", "p_from" "date" DEFAULT NULL::"date", "p_to" "date" DEFAULT NULL::"date", "p_pinned" boolean DEFAULT NULL::boolean, "p_tag_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS TABLE("entry_id" "uuid", "title" "text", "journal_id" "uuid", "journal_title" "text", "journal_color" "text", "journal_is_hidden" boolean, "entry_date" "date", "word_count" integer, "is_pinned" boolean, "snippet" "text", "tags" "jsonb")
    LANGUAGE "plpgsql" STABLE
    AS $$
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


ALTER FUNCTION "public"."search_entries"("p_user_id" "uuid", "p_query" "text", "p_scope" "text", "p_journal_id" "uuid", "p_from" "date", "p_to" "date", "p_pinned" boolean, "p_tag_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_index_entries"("p_user_id" "uuid", "p_scope" "text") RETURNS TABLE("entry_id" "uuid", "title" "text", "journal_id" "uuid", "journal_title" "text", "journal_color" "text", "journal_is_hidden" boolean, "entry_is_hidden" boolean, "entry_date" "date", "word_count" integer, "is_pinned" boolean, "is_favorite" boolean, "search_text" "text", "tags" "jsonb")
    LANGUAGE "plpgsql" STABLE
    AS $$
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


ALTER FUNCTION "public"."search_index_entries"("p_user_id" "uuid", "p_scope" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."entries" (
    "entry_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "journal_id" "uuid" NOT NULL,
    "title" "text",
    "content" "jsonb" DEFAULT '{"type": "doc", "content": []}'::"jsonb" NOT NULL,
    "word_count" integer DEFAULT 0 NOT NULL,
    "is_pinned" boolean DEFAULT false NOT NULL,
    "entry_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_hidden" boolean DEFAULT false NOT NULL,
    "search_text" "text" GENERATED ALWAYS AS (((COALESCE("title", ''::"text") || ' '::"text") || "public"."extract_tiptap_text"("content"))) STORED,
    "is_favorite" boolean DEFAULT false NOT NULL,
    "pinned_at" timestamp with time zone,
    CONSTRAINT "entries_content_is_tiptap_doc" CHECK ((("jsonb_typeof"("content") = 'object'::"text") AND (("content" ->> 'type'::"text") = 'doc'::"text") AND ("jsonb_typeof"(("content" -> 'content'::"text")) = 'array'::"text")))
);


ALTER TABLE "public"."entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entry_tags" (
    "entry_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "tagged_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."entry_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."journals" (
    "journal_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "color" "text" DEFAULT '#1A56DB'::"text" NOT NULL,
    "icon" "text" DEFAULT 'book'::"text" NOT NULL,
    "is_favorite" boolean DEFAULT false NOT NULL,
    "entry_count" integer DEFAULT 0 NOT NULL,
    "total_word_count" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_hidden" boolean DEFAULT false NOT NULL,
    "hidden_entry_count" integer DEFAULT 0 NOT NULL,
    "hidden_word_count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."journals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media" (
    "media_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entry_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "file_type" "text" NOT NULL,
    "file_size" bigint NOT NULL,
    "mime_type" "text" NOT NULL,
    "width" integer,
    "height" integer,
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "duration" integer,
    "thumbnail_url" "text",
    "alt_text" "text",
    "deleted_at" timestamp with time zone,
    "object_path" "text"
);


ALTER TABLE "public"."media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "user_id" "uuid" NOT NULL,
    "full_name" "text" DEFAULT ''::"text" NOT NULL,
    "avatar_url" "text",
    "preferences" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "privacy_pin_type" "text" DEFAULT 'none'::"text" NOT NULL,
    "privacy_pin_hash" "text",
    "vault_secret_type" "text",
    "vault_secret_hash" "text",
    "vault_auto_lock_minutes" integer DEFAULT 5 NOT NULL,
    CONSTRAINT "profiles_privacy_pin_type_check" CHECK (("privacy_pin_type" = ANY (ARRAY['none'::"text", 'pin'::"text", 'password'::"text"]))),
    CONSTRAINT "profiles_vault_secret_type_check" CHECK (("vault_secret_type" = ANY (ARRAY['pin'::"text", 'password'::"text"]))),
    CONSTRAINT "vault_secret_complete" CHECK (((("vault_secret_type" IS NULL) AND ("vault_secret_hash" IS NULL)) OR (("vault_secret_type" IS NOT NULL) AND ("vault_secret_hash" IS NOT NULL))))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tags" (
    "tag_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tag_name" "text" NOT NULL,
    "color" "text" DEFAULT '#1A56DB'::"text" NOT NULL,
    "usage_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tags" OWNER TO "postgres";


ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "entries_pkey" PRIMARY KEY ("entry_id");



ALTER TABLE ONLY "public"."entry_tags"
    ADD CONSTRAINT "entry_tags_pkey" PRIMARY KEY ("entry_id", "tag_id");



ALTER TABLE ONLY "public"."journals"
    ADD CONSTRAINT "journals_pkey" PRIMARY KEY ("journal_id");



ALTER TABLE ONLY "public"."media"
    ADD CONSTRAINT "media_pkey" PRIMARY KEY ("media_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("tag_id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_user_id_tag_name_key" UNIQUE ("user_id", "tag_name");



CREATE INDEX "fts_entries" ON "public"."entries" USING "gin" ("to_tsvector"('"english"'::"regconfig", "search_text"));



CREATE INDEX "idx_entries_deleted" ON "public"."entries" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NOT NULL);



CREATE INDEX "idx_entries_entry_date" ON "public"."entries" USING "btree" ("entry_date");



CREATE INDEX "idx_entries_hidden" ON "public"."entries" USING "btree" ("journal_id", "entry_date" DESC) WHERE (("is_hidden" = true) AND ("deleted_at" IS NULL));



CREATE INDEX "idx_entries_journal_date" ON "public"."entries" USING "btree" ("journal_id", "entry_date" DESC);



CREATE INDEX "idx_entries_journal_hidden" ON "public"."entries" USING "btree" ("journal_id", "is_pinned" DESC, "entry_date" DESC) WHERE (("is_hidden" = true) AND ("deleted_at" IS NULL));



CREATE INDEX "idx_entries_journal_id" ON "public"."entries" USING "btree" ("journal_id");



CREATE INDEX "idx_entries_journal_public" ON "public"."entries" USING "btree" ("journal_id", "is_pinned" DESC, "entry_date" DESC) WHERE (("is_hidden" = false) AND ("deleted_at" IS NULL));



CREATE INDEX "idx_entries_journal_public_created" ON "public"."entries" USING "btree" ("journal_id", "created_at" DESC) WHERE (("is_hidden" = false) AND ("deleted_at" IS NULL));



CREATE INDEX "idx_entries_pinned_at" ON "public"."entries" USING "btree" ("pinned_at" DESC) WHERE ("is_pinned" = true);



CREATE INDEX "idx_entry_tags_entry_id" ON "public"."entry_tags" USING "btree" ("entry_id");



CREATE INDEX "idx_entry_tags_tag_id" ON "public"."entry_tags" USING "btree" ("tag_id");



CREATE INDEX "idx_journals_deleted" ON "public"."journals" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NOT NULL);



CREATE INDEX "idx_journals_hidden_user" ON "public"."journals" USING "btree" ("user_id", "updated_at" DESC) WHERE (("is_hidden" = true) AND ("deleted_at" IS NULL));



CREATE INDEX "idx_journals_user_public" ON "public"."journals" USING "btree" ("user_id", "updated_at" DESC) WHERE (("is_hidden" = false) AND ("deleted_at" IS NULL));



CREATE INDEX "idx_media_deleted" ON "public"."media" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NOT NULL);



CREATE INDEX "idx_media_entry_id" ON "public"."media" USING "btree" ("entry_id");



CREATE INDEX "idx_media_file_type" ON "public"."media" USING "btree" ("file_type");



CREATE INDEX "idx_tags_user_usage_desc" ON "public"."tags" USING "btree" ("user_id", "usage_count" DESC) WHERE ("usage_count" > 0);



CREATE INDEX "trgm_entries_search" ON "public"."entries" USING "gin" ("lower"("search_text") "public"."gin_trgm_ops");



CREATE OR REPLACE TRIGGER "trg_entries_pinned_at" BEFORE INSERT OR UPDATE ON "public"."entries" FOR EACH ROW EXECUTE FUNCTION "public"."fn_entries_pinned_at"();



CREATE OR REPLACE TRIGGER "trg_entries_updated_at" BEFORE UPDATE ON "public"."entries" FOR EACH ROW EXECUTE FUNCTION "public"."fn_entries_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_entries_word_count" BEFORE INSERT OR UPDATE OF "content" ON "public"."entries" FOR EACH ROW EXECUTE FUNCTION "public"."fn_entries_word_count"();



CREATE OR REPLACE TRIGGER "trg_journals_bump_on_entry_edit" AFTER UPDATE ON "public"."entries" FOR EACH ROW EXECUTE FUNCTION "public"."fn_journals_bump_from_entry_edit"();



CREATE OR REPLACE TRIGGER "trg_journals_rollup_delete" AFTER DELETE ON "public"."entries" FOR EACH ROW EXECUTE FUNCTION "public"."fn_journals_rollup"();



CREATE OR REPLACE TRIGGER "trg_journals_rollup_insert" AFTER INSERT ON "public"."entries" FOR EACH ROW EXECUTE FUNCTION "public"."fn_journals_rollup"();



CREATE OR REPLACE TRIGGER "trg_journals_rollup_update" AFTER UPDATE OF "deleted_at", "word_count", "is_hidden" ON "public"."entries" FOR EACH ROW EXECUTE FUNCTION "public"."fn_journals_rollup"();



CREATE OR REPLACE TRIGGER "trg_journals_updated_at" BEFORE UPDATE ON "public"."journals" FOR EACH ROW EXECUTE FUNCTION "public"."fn_journals_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_tags_usage_delete" AFTER DELETE ON "public"."entry_tags" FOR EACH ROW EXECUTE FUNCTION "public"."fn_tags_usage_count"();



CREATE OR REPLACE TRIGGER "trg_tags_usage_insert" AFTER INSERT ON "public"."entry_tags" FOR EACH ROW EXECUTE FUNCTION "public"."fn_tags_usage_count"();



CREATE OR REPLACE TRIGGER "trg_tags_usage_on_entry_hidden" AFTER UPDATE OF "is_hidden", "deleted_at" ON "public"."entries" FOR EACH ROW EXECUTE FUNCTION "public"."fn_tags_usage_count_for_entry"();



CREATE OR REPLACE TRIGGER "trg_tags_usage_on_journal_hidden" AFTER UPDATE OF "is_hidden", "deleted_at" ON "public"."journals" FOR EACH ROW EXECUTE FUNCTION "public"."fn_tags_usage_count_for_journal"();



ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "entries_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("journal_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entry_tags"
    ADD CONSTRAINT "entry_tags_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("entry_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entry_tags"
    ADD CONSTRAINT "entry_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("tag_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."journals"
    ADD CONSTRAINT "journals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media"
    ADD CONSTRAINT "media_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("entry_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "entries: delete own" ON "public"."entries" FOR DELETE TO "authenticated" USING (("journal_id" IN ( SELECT "journals"."journal_id"
   FROM "public"."journals"
  WHERE ("journals"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "entries: insert own" ON "public"."entries" FOR INSERT TO "authenticated" WITH CHECK (("journal_id" IN ( SELECT "journals"."journal_id"
   FROM "public"."journals"
  WHERE ("journals"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "entries: select own" ON "public"."entries" FOR SELECT TO "authenticated" USING (("journal_id" IN ( SELECT "journals"."journal_id"
   FROM "public"."journals"
  WHERE ("journals"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "entries: update own" ON "public"."entries" FOR UPDATE TO "authenticated" USING (("journal_id" IN ( SELECT "journals"."journal_id"
   FROM "public"."journals"
  WHERE ("journals"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("journal_id" IN ( SELECT "journals"."journal_id"
   FROM "public"."journals"
  WHERE ("journals"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."entry_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "entry_tags: delete own" ON "public"."entry_tags" FOR DELETE TO "authenticated" USING (("entry_id" IN ( SELECT "e"."entry_id"
   FROM "public"."entries" "e"
  WHERE ("e"."journal_id" IN ( SELECT "j"."journal_id"
           FROM "public"."journals" "j"
          WHERE ("j"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "entry_tags: insert own" ON "public"."entry_tags" FOR INSERT TO "authenticated" WITH CHECK (("entry_id" IN ( SELECT "e"."entry_id"
   FROM "public"."entries" "e"
  WHERE ("e"."journal_id" IN ( SELECT "j"."journal_id"
           FROM "public"."journals" "j"
          WHERE ("j"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "entry_tags: select own" ON "public"."entry_tags" FOR SELECT TO "authenticated" USING (("entry_id" IN ( SELECT "e"."entry_id"
   FROM "public"."entries" "e"
  WHERE ("e"."journal_id" IN ( SELECT "j"."journal_id"
           FROM "public"."journals" "j"
          WHERE ("j"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."journals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "journals: delete own" ON "public"."journals" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "journals: insert own" ON "public"."journals" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "journals: select own" ON "public"."journals" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "journals: update own" ON "public"."journals" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."media" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "media: delete own" ON "public"."media" FOR DELETE TO "authenticated" USING (("entry_id" IN ( SELECT "e"."entry_id"
   FROM "public"."entries" "e"
  WHERE ("e"."journal_id" IN ( SELECT "j"."journal_id"
           FROM "public"."journals" "j"
          WHERE ("j"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "media: insert own" ON "public"."media" FOR INSERT TO "authenticated" WITH CHECK (("entry_id" IN ( SELECT "e"."entry_id"
   FROM "public"."entries" "e"
  WHERE ("e"."journal_id" IN ( SELECT "j"."journal_id"
           FROM "public"."journals" "j"
          WHERE ("j"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "media: select own" ON "public"."media" FOR SELECT TO "authenticated" USING (("entry_id" IN ( SELECT "e"."entry_id"
   FROM "public"."entries" "e"
  WHERE ("e"."journal_id" IN ( SELECT "j"."journal_id"
           FROM "public"."journals" "j"
          WHERE ("j"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles: insert own" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "profiles: select own" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "profiles: update own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tags: delete own" ON "public"."tags" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "tags: insert own" ON "public"."tags" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "tags: select own" ON "public"."tags" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "tags: update own" ON "public"."tags" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."entries";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."journals";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."tags";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";














































































































































































REVOKE ALL ON FUNCTION "public"."get_dashboard_snapshot"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_dashboard_snapshot"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";
























GRANT ALL ON TABLE "public"."entries" TO "anon";
GRANT ALL ON TABLE "public"."entries" TO "authenticated";
GRANT ALL ON TABLE "public"."entries" TO "service_role";



GRANT ALL ON TABLE "public"."entry_tags" TO "anon";
GRANT ALL ON TABLE "public"."entry_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."entry_tags" TO "service_role";



GRANT ALL ON TABLE "public"."journals" TO "anon";
GRANT ALL ON TABLE "public"."journals" TO "authenticated";
GRANT ALL ON TABLE "public"."journals" TO "service_role";



GRANT ALL ON TABLE "public"."media" TO "anon";
GRANT ALL ON TABLE "public"."media" TO "authenticated";
GRANT ALL ON TABLE "public"."media" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."tags" TO "anon";
GRANT ALL ON TABLE "public"."tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tags" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































