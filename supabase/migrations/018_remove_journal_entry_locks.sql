-- ============================================================
-- Noteworthy — remove per-journal / per-entry locks
-- Migration: 018_remove_journal_entry_locks.sql
-- ============================================================
-- The vault is now the only security feature. Hide a journal or entry
-- to gate it behind the vault PIN/password. Per-entity PIN/password
-- locks are removed entirely.
--
-- Drops:
--   * entries.lock_type, entries.lock_hash
--   * journals.lock_type, journals.lock_hash
--   * journals.entry_lock_type, journals.entry_lock_hash
--
-- search_entries() and the FTS / trigram indexes only reference
-- title + content, so nothing else needs to be rebuilt.
-- ============================================================

ALTER TABLE entries
  DROP COLUMN IF EXISTS lock_type,
  DROP COLUMN IF EXISTS lock_hash;

ALTER TABLE journals
  DROP COLUMN IF EXISTS lock_type,
  DROP COLUMN IF EXISTS lock_hash,
  DROP COLUMN IF EXISTS entry_lock_type,
  DROP COLUMN IF EXISTS entry_lock_hash;
