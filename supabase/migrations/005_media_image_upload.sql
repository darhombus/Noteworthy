-- ============================================================
-- Noteworthy — Module 4.1 Image Upload
-- Migration: 005_media_image_upload.sql
--
-- Brings the `media` table up to the schema required by the image
-- upload module (adds duration / thumbnail_url / alt_text and an
-- entry_id index), creates the public `media` storage bucket, and
-- attaches per-user RLS policies on storage.objects so each user
-- can only write/delete inside their own `{auth.uid()}/...` prefix.
-- ============================================================

-- 1. media table — additive columns + index
ALTER TABLE media
  ADD COLUMN IF NOT EXISTS duration       INT,
  ADD COLUMN IF NOT EXISTS thumbnail_url  TEXT,
  ADD COLUMN IF NOT EXISTS alt_text       TEXT;

CREATE INDEX IF NOT EXISTS idx_media_entry_id ON media(entry_id);

-- 2. Public 'media' bucket (30 MB ceiling so video uploads in 4.2 also fit;
--    image-specific 5 MB limit is enforced server-side in /api/media)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  true,
  31457280,
  ARRAY['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm','video/quicktime']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3. Storage RLS — public read, authenticated write/delete inside own folder
DROP POLICY IF EXISTS "media bucket: select" ON storage.objects;
CREATE POLICY "media bucket: select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media');

DROP POLICY IF EXISTS "media bucket: insert own" ON storage.objects;
CREATE POLICY "media bucket: insert own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "media bucket: delete own" ON storage.objects;
CREATE POLICY "media bucket: delete own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
