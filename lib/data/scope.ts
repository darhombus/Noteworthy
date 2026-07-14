/**
 * Hidden-vault data-access keystone.
 *
 * Two factory functions, `publicScope(userId)` and `hiddenScope(userId)`,
 * return a `Scope` object whose methods are the ONLY sanctioned way to
 * read journals and entries from anywhere outside this file. Every method
 * applies a fixed set of filters that match its surface, so a caller
 * physically cannot read a hidden row through `publicScope` or vice
 * versa — there's no third method, no "all" surface, and no opt-out flag.
 *
 * The rules baked in here:
 *   1. Every method filters by user_id and deleted_at IS NULL.
 *   2. publicScope filters is_hidden = false on BOTH the entry and its
 *      parent journal — a public entry inside a hidden journal is hidden.
 *   3. hiddenScope requires the vault to be open. Throws VaultLockedError
 *      otherwise. Returns rows where is_hidden = true on the entry OR
 *      its parent journal — belt and braces.
 *
 * If a future feature needs to look at both surfaces it makes two calls
 * and merges in code. Do not add a third scope.
 */

import { createClient } from '@/lib/supabase/server'
import { isVaultOpen } from '@/lib/privacy/vault'
import { timePerf } from '@/lib/perf/server'
import { withHotCache } from '@/lib/perf/hot-cache'
import type { Database } from '@/types/supabase'

type Surface = 'public' | 'hidden'
type Journal = Database['public']['Tables']['journals']['Row']
type Entry = Database['public']['Tables']['entries']['Row']
type SupabaseServer = Awaited<ReturnType<typeof createClient>>
// Keep a short-lived cache window so back-to-back route transitions reuse
// data instead of re-querying on every click, while still refreshing quickly.
const HOT_SCOPE_TTL_MS = 10000

// `journals.list` is rebuilt rarely (user creates / edits / deletes a journal
// occasionally) and is the most-visited list in the app. Its 10s window kept
// expiring between actual sessions of use (logs showed cold ~250-420ms hits
// after 50s gaps). Stretched to 30s; correctness is preserved because the
// four journal write actions (create / update / delete / toggleFavourite)
// explicitly clearHotCache the matching prefix after each write.
const HOT_SCOPE_JOURNALS_LIST_TTL_MS = 30000

export class VaultLockedError extends Error {
  constructor(message = 'Vault is locked') {
    super(message)
    this.name = 'VaultLockedError'
  }
}

export interface Scope {
  surface: Surface
  userId: string
  journals: {
    list: () => Promise<Journal[]>
    byId: (id: string) => Promise<Journal | null>
  }
  entries: {
    listByJournal: (journalId: string) => Promise<Entry[]>
    byId: (id: string) => Promise<Entry | null>
    /** Hidden entries whose parent journal is public. Empty in publicScope. */
    standalone: () => Promise<Entry[]>
  }
}

// ---------------------------------------------------------------------------
// publicScope
// ---------------------------------------------------------------------------

export async function publicScope(userId: string): Promise<Scope> {
  const supabase = await createClient()
  const keyBase = `scope:public:${userId}`

  return {
    surface: 'public',
    userId,
    journals: {
      list: () =>
        timePerf(
          'scope.public.journals.list',
          () =>
            withHotCache(`${keyBase}:journals.list`, HOT_SCOPE_JOURNALS_LIST_TTL_MS, () =>
              listJournalsBySurface(supabase, userId, 'public'),
            ),
          { userId },
        ),
      byId: (id) =>
        timePerf(
          'scope.public.journals.byId',
          () =>
            withHotCache(`${keyBase}:journals.byId:${id}`, HOT_SCOPE_TTL_MS, () =>
              journalByIdInSurface(supabase, userId, id, 'public'),
            ),
          { userId, id },
        ),
    },
    entries: {
      listByJournal: (journalId) =>
        timePerf(
          'scope.public.entries.listByJournal',
          () =>
            withHotCache(`${keyBase}:entries.listByJournal:${journalId}`, HOT_SCOPE_TTL_MS, () =>
              listPublicEntriesInPublicJournal(supabase, userId, journalId),
            ),
          { userId, journalId },
        ),
      byId: (id) =>
        timePerf(
          'scope.public.entries.byId',
          () =>
            withHotCache(`${keyBase}:entries.byId:${id}`, HOT_SCOPE_TTL_MS, () =>
              publicEntryById(supabase, userId, id),
            ),
          {
            userId,
            id,
          },
        ),
      standalone: async () => [],
    },
  }
}

// ---------------------------------------------------------------------------
// hiddenScope
// ---------------------------------------------------------------------------

export async function hiddenScope(userId: string): Promise<Scope> {
  const vaultOpen = await timePerf('scope.hidden.vaultOpenCheck', () => isVaultOpen(userId), {
    userId,
  })
  if (!vaultOpen) throw new VaultLockedError()
  const supabase = await createClient()
  const keyBase = `scope:hidden:${userId}`

  return {
    surface: 'hidden',
    userId,
    journals: {
      list: () =>
        timePerf(
          'scope.hidden.journals.list',
          () =>
            withHotCache(`${keyBase}:journals.list`, HOT_SCOPE_JOURNALS_LIST_TTL_MS, () =>
              listJournalsBySurface(supabase, userId, 'hidden'),
            ),
          { userId },
        ),
      byId: (id) =>
        timePerf(
          'scope.hidden.journals.byId',
          () =>
            withHotCache(`${keyBase}:journals.byId:${id}`, HOT_SCOPE_TTL_MS, () =>
              journalByIdInSurface(supabase, userId, id, 'hidden'),
            ),
          { userId, id },
        ),
    },
    entries: {
      listByJournal: (journalId) =>
        timePerf(
          'scope.hidden.entries.listByJournal',
          () =>
            withHotCache(`${keyBase}:entries.listByJournal:${journalId}`, HOT_SCOPE_TTL_MS, () =>
              listHiddenSurfaceEntriesInJournal(supabase, userId, journalId),
            ),
          { userId, journalId },
        ),
      byId: (id) =>
        timePerf(
          'scope.hidden.entries.byId',
          () =>
            withHotCache(`${keyBase}:entries.byId:${id}`, HOT_SCOPE_TTL_MS, () =>
              hiddenEntryById(supabase, userId, id),
            ),
          {
            userId,
            id,
          },
        ),
      standalone: () =>
        timePerf(
          'scope.hidden.entries.standalone',
          () =>
            withHotCache(`${keyBase}:entries.standalone`, HOT_SCOPE_TTL_MS, () =>
              listStandaloneHiddenEntries(supabase, userId),
            ),
          { userId },
        ),
    },
  }
}

// ---------------------------------------------------------------------------
// Internal helpers — single source of truth for every filter
// ---------------------------------------------------------------------------

async function listJournalsBySurface(
  supabase: SupabaseServer,
  userId: string,
  surface: Surface,
): Promise<Journal[]> {
  const { data, error } = await supabase
    .from('journals')
    .select('*')
    .eq('user_id', userId)
    .eq('is_hidden', surface === 'hidden')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

async function journalByIdInSurface(
  supabase: SupabaseServer,
  userId: string,
  journalId: string,
  surface: Surface,
): Promise<Journal | null> {
  const { data, error } = await supabase
    .from('journals')
    .select('*')
    .eq('journal_id', journalId)
    .eq('user_id', userId)
    .eq('is_hidden', surface === 'hidden')
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  return data
}

// ── public entries ────────────────────────────────────────────────────────

async function listPublicEntriesInPublicJournal(
  supabase: SupabaseServer,
  userId: string,
  journalId: string,
): Promise<Entry[]> {
  type EntryWithJournalFlags = Entry & {
    journals: { user_id: string; is_hidden: boolean; deleted_at: string | null } | null
  }

  const { data, error } = await supabase
    .from('entries')
    .select(
      'entry_id, journal_id, title, entry_date, word_count, created_at, updated_at, is_pinned, pinned_at, is_favorite, is_hidden, deleted_at, search_text, journals!inner(user_id, is_hidden, deleted_at)',
    )
    .eq('journal_id', journalId)
    .eq('is_hidden', false)
    .is('deleted_at', null)
    .eq('journals.user_id', userId)
    .eq('journals.is_hidden', false)
    .is('journals.deleted_at', null)
    .order('is_pinned', { ascending: false })
    .order('pinned_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .returns<EntryWithJournalFlags[]>()
  if (error) throw error
  return (data ?? []).map(({ journals: _join, ...entry }) => {
    void _join
    return entry as Entry
  })
}

async function publicEntryById(
  supabase: SupabaseServer,
  userId: string,
  entryId: string,
): Promise<Entry | null> {
  // Inline-join the parent journal so we can apply user_id + journal-hidden
  // filters in a single round-trip. The cast strips the nested join shape
  // back to a plain Entry — see CLAUDE.md memory on `journals!inner(...)` in
  // EntryEditor; that pitfall is specific to the editor's autosave echo
  // filter and does not apply to data-only reads.
  type EntryWithJournalFlags = Entry & {
    journals: { user_id: string; is_hidden: boolean; deleted_at: string | null } | null
  }

  const { data, error } = await supabase
    .from('entries')
    .select('*, journals!inner(user_id, is_hidden, deleted_at)')
    .eq('entry_id', entryId)
    .eq('is_hidden', false)
    .is('deleted_at', null)
    .eq('journals.user_id', userId)
    .eq('journals.is_hidden', false)
    .is('journals.deleted_at', null)
    .maybeSingle<EntryWithJournalFlags>()
  if (error) throw error
  if (!data) return null
  const { journals: _join, ...entry } = data
  void _join
  return entry as Entry
}

// ── hidden entries ────────────────────────────────────────────────────────

async function listHiddenSurfaceEntriesInJournal(
  supabase: SupabaseServer,
  userId: string,
  journalId: string,
): Promise<Entry[]> {
  type EntryWithJournalFlags = Entry & {
    journals: { user_id: string; is_hidden: boolean; deleted_at: string | null } | null
  }

  // One query gets rows plus parent-journal visibility.
  const { data, error } = await supabase
    .from('entries')
    .select(
      'entry_id, journal_id, title, entry_date, word_count, created_at, updated_at, is_pinned, pinned_at, is_favorite, is_hidden, deleted_at, search_text, journals!inner(user_id, is_hidden, deleted_at)',
    )
    .eq('journal_id', journalId)
    .eq('journals.user_id', userId)
    .is('journals.deleted_at', null)
    .is('deleted_at', null)
    .order('is_pinned', { ascending: false })
    .order('pinned_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .returns<EntryWithJournalFlags[]>()
  if (error) throw error
  const rows = data ?? []
  if (!rows.length) return []
  const journalHidden = rows[0]?.journals?.is_hidden ?? false
  const visibleRows = journalHidden ? rows : rows.filter((r) => r.is_hidden)
  return visibleRows.map(({ journals: _join, ...entry }) => {
    void _join
    return entry as Entry
  })
}

async function hiddenEntryById(
  supabase: SupabaseServer,
  userId: string,
  entryId: string,
): Promise<Entry | null> {
  type EntryWithJournalFlags = Entry & {
    journals: { user_id: string; is_hidden: boolean; deleted_at: string | null } | null
  }

  // Fetch the entry + parent journal together. The hidden surface accepts
  // a row when EITHER the entry or its parent journal is hidden.
  const { data, error } = await supabase
    .from('entries')
    .select('*, journals!inner(user_id, is_hidden, deleted_at)')
    .eq('entry_id', entryId)
    .is('deleted_at', null)
    .eq('journals.user_id', userId)
    .is('journals.deleted_at', null)
    .maybeSingle<EntryWithJournalFlags>()
  if (error) throw error
  if (!data || !data.journals) return null

  const visibleToHidden = data.is_hidden || data.journals.is_hidden
  if (!visibleToHidden) return null

  const { journals: _join, ...entry } = data
  void _join
  return entry as Entry
}

async function listStandaloneHiddenEntries(
  supabase: SupabaseServer,
  userId: string,
): Promise<Entry[]> {
  type EntryWithJournalFlags = Entry & {
    journals: { user_id: string; is_hidden: boolean; deleted_at: string | null } | null
  }

  const { data, error } = await supabase
    .from('entries')
    .select(
      'entry_id, journal_id, title, entry_date, word_count, created_at, updated_at, is_pinned, pinned_at, is_favorite, is_hidden, deleted_at, search_text, journals!inner(user_id, is_hidden, deleted_at)',
    )
    .eq('is_hidden', true)
    .is('deleted_at', null)
    .eq('journals.user_id', userId)
    .eq('journals.is_hidden', false)
    .is('journals.deleted_at', null)
    .order('entry_date', { ascending: false })
    .returns<EntryWithJournalFlags[]>()
  if (error) throw error
  return (data ?? []).map(({ journals: _join, ...entry }) => {
    void _join
    return entry as Entry
  })
}
