-- Drop the two pairs of byte-identical duplicate indexes on journals.
-- Each pair has the same columns, ordering, and partial WHERE clause —
-- only the name differs.

DROP INDEX IF EXISTS public.idx_journals_visible_user;
DROP INDEX IF EXISTS public.idx_journals_user_hidden;

-- Kept: idx_journals_user_public, idx_journals_hidden_user
