-- ============================================================
-- Noteworthy — Enable required Postgres extensions
-- Migration: 000_enable_extensions.sql
--
-- Runs before 001. Migrations 001 and 006 schedule a soft-delete
-- purge job via pg_cron (cron.schedule / cron.unschedule). On the
-- hosted project pg_cron was enabled out-of-band via the dashboard,
-- so those migrations succeeded there; on a clean build (local Docker
-- stack, CI) the `cron` schema does not exist until the extension is
-- created, so 001 fails. Enabling pg_cron explicitly here makes the
-- migration set self-contained and reproducible.
--
-- pg_trgm (used by 017 and 020) is created inline in those files and
-- needs no entry here.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
