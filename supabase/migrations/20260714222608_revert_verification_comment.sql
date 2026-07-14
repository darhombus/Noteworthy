-- ============================================================
-- Retrofit verification (Phase 6) — revert of the throwaway migration.
--
-- Undoes 20260714221505_retrofit_verification_comment.sql by clearing the
-- journals table comment back to its original state (no comment). Applied
-- through the same feature → dev → staging → main flow, completing the
-- end-to-end verification loop.
-- ============================================================

COMMENT ON TABLE public.journals IS NULL;
