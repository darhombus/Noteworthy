-- ============================================================
-- Noteworthy — Shared entry lock per journal
-- Migration: 008_shared_entry_lock.sql
-- ============================================================
-- Entry locks are now per-journal. A journal holds a single shared
-- `entry_lock_type` + `entry_lock_hash`; individual entries opt into
-- that shared secret by setting their own `lock_type` to match. The
-- `entries.lock_hash` column is kept (to preserve any existing data)
-- but is no longer read or written by the app — verification routes
-- through the parent journal.
-- ============================================================

ALTER TABLE journals
  ADD COLUMN IF NOT EXISTS entry_lock_type TEXT NOT NULL DEFAULT 'none'
    CHECK (entry_lock_type IN ('none', 'pin', 'password')),
  ADD COLUMN IF NOT EXISTS entry_lock_hash TEXT;

-- If any pre-existing entry locks exist, migrate the first one per journal
-- up to the journal. Later entry locks in the same journal are left as-is;
-- the new UI will force them to re-adopt the journal's shared secret the
-- next time they are toggled.
DO $$
DECLARE
  j RECORD;
  first_entry RECORD;
BEGIN
  FOR j IN SELECT journal_id FROM journals WHERE entry_lock_type = 'none' LOOP
    SELECT lock_type, lock_hash
      INTO first_entry
      FROM entries
     WHERE journal_id = j.journal_id
       AND lock_type <> 'none'
       AND lock_hash IS NOT NULL
     ORDER BY created_at ASC
     LIMIT 1;

    IF FOUND THEN
      UPDATE journals
         SET entry_lock_type = first_entry.lock_type,
             entry_lock_hash = first_entry.lock_hash
       WHERE journal_id = j.journal_id;
    END IF;
  END LOOP;
END$$;
