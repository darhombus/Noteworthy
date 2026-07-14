-- ============================================================
-- Retrofit verification (Phase 6) — THROWAWAY migration.
--
-- A harmless, reversible schema change (a table comment) used only to
-- exercise the full pipeline end to end: CI on each PR, preview deploys,
-- and the deploy-migrations `db push` to hosted on merge to main.
-- Reverted by a follow-up migration.
-- ============================================================

COMMENT ON TABLE public.journals IS 'retrofit-verification: pipeline test';
