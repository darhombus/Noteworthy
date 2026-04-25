-- ============================================================
-- Noteworthy — Hidden journals/entries + Privacy Vault PIN
-- Migration: 011_hidden_privacy_vault.sql
-- ============================================================
-- Adds a per-user "Privacy PIN/Password" (separate from the existing
-- journal/entry lock secrets) plus a visibility flag on journals and
-- entries. Hidden items are filtered out of every normal list query
-- at the app layer and are only surfaced under /hidden after the
-- privacy secret has been verified.
--
-- RLS stays exactly as-is — hidden is an app-level privacy layer, not
-- a crypto boundary. Rollup triggers continue to count hidden entries
-- into journals.entry_count / total_word_count by design.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS privacy_pin_type TEXT NOT NULL DEFAULT 'none'
    CHECK (privacy_pin_type IN ('none', 'pin', 'password')),
  ADD COLUMN IF NOT EXISTS privacy_pin_hash TEXT;

ALTER TABLE journals
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial indexes so both "hidden list for /hidden" and "visible list
-- for the main app" stay cheap. Most queries filter is_hidden = false,
-- so give that the dedicated index.
CREATE INDEX IF NOT EXISTS idx_journals_visible_user
  ON journals(user_id, updated_at DESC)
  WHERE is_hidden = FALSE AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_journals_hidden_user
  ON journals(user_id, updated_at DESC)
  WHERE is_hidden = TRUE AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_entries_hidden
  ON entries(journal_id, entry_date DESC)
  WHERE is_hidden = TRUE AND deleted_at IS NULL;
