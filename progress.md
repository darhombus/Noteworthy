# Noteworthy — Build Progress

## Module Status

| Module | Description | Status |
|--------|-------------|--------|
| 1.1 | Scaffold | Done |
| 1.2 | Database Schema | Done |
| 1.3 | Auth | Done |
| 1.4 | App Shell | Done |
| 2.1 | Journal Management | Done |
| 2.2 | Entry Management | Done |
| 2.3 | BlockNote Rich Text Editor | Not started |
| 3.x | Tags | Not started |
| 4.x | Search | Not started |
| 5.x | Dashboard / Analytics | Not started |
| 6.x | Settings | Not started |
| 7.x | Recycle Bin | Not started |

---

## Completed Modules

### Module 1.1 — Scaffold
- Next.js app at root (`app/` not `src/app/`)
- `@/*` alias maps to root
- Tailwind v3, `darkMode: 'class'`, CSS vars `--brand`
- `lib/supabase/client.ts` (browser) + `lib/supabase/server.ts` (SSR via cookies)

### Module 1.2 — Database Schema
- 6 tables: `profiles`, `journals`, `entries`, `tags`, `entry_tags`, `media`
- RLS enabled on all tables with per-user policies
- 8 indexes including `fts_entries` GIN full-text search
- Triggers: `updated_at`, `word_count`, `entry_count`, `total_word_count`, `usage_count`
- pg_cron: purges soft-deleted rows older than 30 days at 3 am daily
- `types/supabase.ts` generated via Supabase CLI

### Module 1.3 — Auth
- `/` landing page
- `/signup` — full name, email, password + strength indicator, creates `profiles` row
- `/login` — email, password, remember me, forgot password link
- `/reset-password` — sends magic link
- `/update-password` — sets new password, redirects to `/login`
- `/callback` — exchanges Supabase auth code for session (PKCE flow)
- `InactivityModal` — 30 min inactivity → 60 s countdown → auto sign-out
- All forms: React Hook Form + Zod + zodResolver

### Module 1.4 — App Shell
- `store/useUIStore.ts` — Zustand: `sidebarOpen`, `toggleSidebar`, `setSidebarOpen`
- `components/layout/ThemeToggle.tsx` — light / dark binary toggle
- `components/layout/Sidebar.tsx` — 240 px lg+, 60 px icon-only md, drawer mobile
- `components/layout/TopBar.tsx` — hamburger, breadcrumb, search, new entry button
- `components/layout/AppShell.tsx` — server component composing layout
- `app/(app)/layout.tsx` — fetches user + profile, builds `SidebarUser`, renders `AppShell`

### Module 2.1 — Journal Management
- `lib/validations/journals.ts` — `createJournalSchema`, `updateJournalSchema`; 8 colours, 8 icons
- `lib/actions/journals.ts` — `createJournal`, `updateJournal`, `deleteJournal`, `toggleFavourite`
- `app/(app)/journals/page.tsx` — server component, fetches journals ordered by favourite then date
- `components/journals/JournalGrid.tsx` — sort controls, empty state, create/edit/delete modal wiring
- `components/journals/JournalCard.tsx` — colour accent border, optimistic favourite toggle, three-dot menu
- `components/journals/JournalModal.tsx` — colour picker, icon picker, create + edit modes
- `components/journals/DeleteJournalModal.tsx` — shows entry count warning before deletion

### Module 2.2 — Entry Management
- `lib/validations/entries.ts` — `createEntrySchema`, `updateEntrySchema`
- `lib/actions/entries.ts` — `createEntry`, `updateEntry` (conflict detection), `softDeleteEntry`, `togglePin`
- `app/api/entries/[entryId]/route.ts` — PATCH route handler for beacon saves (`keepalive: true`)
- `hooks/useDebounce.ts` — generic debounce hook
- `hooks/useAutoSave.ts` — debounced save, retry (1 s / 2 s / 4 s), conflict detection, beacon save on `pagehide`
- `hooks/useBeforeUnload.ts` — warns browser before closing when save is pending/saving/error
- `components/entries/SaveStatus.tsx` — idle / pending / saving / saved / error indicator
- `components/entries/ConflictDialog.tsx` — "Keep my changes" / "Discard and reload" modal
- `components/entries/DeleteEntryModal.tsx` — soft-delete confirmation
- `components/entries/EntryCard.tsx` — optimistic pin toggle, three-dot menu, date display
- `components/entries/EntryList.tsx` — entry grid, new-entry button (client-side creation)
- `components/entries/EntryEditor.tsx` — title, date, textarea placeholder, save status, conflict dialog
- `app/(app)/journals/[journalId]/page.tsx` — journal detail: fetches journal + entries
- `app/(app)/journals/[journalId]/entries/[entryId]/page.tsx` — entry editor page (`key={entry.updated_at}` for clean remount on discard)

---

## Bug Fixes Applied

| Fix | Description |
|-----|-------------|
| Three-dot dropdown clipped | Removed `overflow-hidden` from `JournalCard`; replaced absolute-div border with `border-l-4` + inline `style` |
| ThemeToggle had system/monitor mode | Switched to binary light/dark toggle using `resolvedTheme` |
| `middleware.ts` deprecation warning | Renamed to `proxy.ts`, exported function renamed to `proxy` |
| Word count trigger — strict jsonpath | Migration: changed `strict $.**.text` to `lax $.**.text` |
| Word count trigger — `string_agg(jsonb)` type error | Migration: changed `string_agg(val, ' ')` to `string_agg(val #>> '{}', ' ')` |
| `column profiles.id does not exist` | Fixed `app/(app)/layout.tsx` to query `.eq('user_id', user.id)` |
| New entry creation flickering | Moved creation from server-side redirect to client-side `createEntry` + `router.push()` |
| "Discard and reload" not resetting editor | Added `key={entry.updated_at}` to `<EntryEditor>` for full remount on refresh |
| Changes lost when closing tab mid-save | Added `pagehide` beacon save using `fetch` with `keepalive: true` |
