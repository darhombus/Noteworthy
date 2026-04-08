-- Enforce that entries.content is a Tiptap doc, not an array or primitive.
--
-- The previous default of '[]'::jsonb produced rows that were structurally
-- invalid for Tiptap (which expects { type: 'doc', content: [...] }). This
-- migration:
--   1. Backfills any malformed rows to a valid empty doc.
--   2. Switches the default to a valid empty doc.
--   3. Adds a CHECK constraint so the database refuses any row whose content
--      is not an object with type='doc' and an array 'content' field.

-- 1. Backfill: rewrite any non-doc rows to an empty doc.
UPDATE entries
SET content = '{"type":"doc","content":[]}'::jsonb
WHERE jsonb_typeof(content) <> 'object'
   OR content->>'type' IS DISTINCT FROM 'doc'
   OR jsonb_typeof(content->'content') <> 'array';

-- 2. New default is a valid empty Tiptap document.
ALTER TABLE entries
  ALTER COLUMN content SET DEFAULT '{"type":"doc","content":[]}'::jsonb;

-- 3. Reject any future write that does not look like a Tiptap doc.
ALTER TABLE entries
  ADD CONSTRAINT entries_content_is_tiptap_doc
  CHECK (
    jsonb_typeof(content) = 'object'
    AND content->>'type' = 'doc'
    AND jsonb_typeof(content->'content') = 'array'
  );
