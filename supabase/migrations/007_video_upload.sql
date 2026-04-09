-- ============================================================
-- Noteworthy — Module 4.2 Video Upload
-- Migration: 007_video_upload.sql
--
-- The media table already has all columns required for video
-- (duration INT, thumbnail_url TEXT, width INT, height INT —
-- all nullable, added in 005_media_image_upload.sql).
-- file_type is TEXT so 'video' is already a valid value.
--
-- This migration:
--   1. Adds an index on file_type so the storage-usage breakdown
--      query (GROUP BY file_type) in /api/storage/quota is fast.
--   2. Ensures duration and thumbnail_url are nullable (they are
--      by construction — ALTER TABLE is a no-op if already correct,
--      included here for documentation clarity).
-- ============================================================

-- Index for fast breakdown queries grouped by file_type
CREATE INDEX IF NOT EXISTS idx_media_file_type ON media (file_type);

-- Explicit confirmation: duration must be nullable (images have no duration)
ALTER TABLE media ALTER COLUMN duration DROP NOT NULL;

-- Explicit confirmation: thumbnail_url must be nullable (images have no thumbnail)
ALTER TABLE media ALTER COLUMN thumbnail_url DROP NOT NULL;
