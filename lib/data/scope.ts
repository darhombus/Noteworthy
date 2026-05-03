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
import type { Database } from '@/types/supabase'

type Surface = 'public' | 'hidden'
type Journal = Database['public']['Tables']['journals']['Row']
type Entry = Database['public']['Tables']['entries']['Row']
type SupabaseServer = Awaited<ReturnType<typeof createClient>>

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
    /** Every entry visible on this surface in a single query. The dashboard
     *  composes its aggregations from this — listing per-journal would be
     *  N+1. Hidden surface only callable behind an open vault (the scope
     *  factory has already enforced that). */
    listAll: () => Promise<Entry[]>
  }
}

// ---------------------------------------------------------------------------
// publicScope
// ---------------------------------------------------------------------------

export async function publicScope(userId: string): Promise<Scope> {
  const supabase = await createClient()

  return {
    surface: 'public',
    userId,
    journals: {
      list: () => listJournalsBySurface(supabase, userId, 'public'),
      byId: (id) => journalByIdInSurface(supabase, userId, id, 'public'),
    },
    entries: {
      listByJournal: (journalId) =>
        listPublicEntriesInPublicJournal(supabase, userId, journalId),
      byId: (id) => publicEntryById(supabase, userId, id),
      standalone: async () => [],
      listAll: () => listAllPublicEntries(supabase, userId),
    },
  }
}

// ---------------------------------------------------------------------------
// hiddenScope
// ---------------------------------------------------------------------------

export async function hiddenScope(userId: string): Promise<Scope> {
  if (!(await isVaultOpen(userId))) throw new VaultLockedError()
  const supabase = await createClient()

  return {
    surface: 'hidden',
    userId,
    journals: {
      list: () => listJournalsBySurface(supabase, userId, 'hidden'),
      byId: (id) => journalByIdInSurface(supabase, userId, id, 'hidden'),
    },
    entries: {
      listByJournal: (journalId) =>
        listHiddenSurfaceEntriesInJournal(supabase, userId, journalId),
      byId: (id) => hiddenEntryById(supabase, userId, id),
      standalone: () => listStandaloneHiddenEntries(supabase, userId),
      listAll: () => listAllHiddenEntries(supabase, userId),
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
  // Verify the journal is owned by the user, not deleted, and not hidden —
  // a public entry inside a hidden journal still counts as hidden.
  const journal = await journalByIdInSurface(supabase, userId, journalId, 'public')
  if (!journal) return []

  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('journal_id', journalId)
    .eq('is_hidden', false)
    .is('deleted_at', null)
    .order('is_pinned', { ascending: false })
    .order('pinned_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data ?? []
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
  // Fetch the journal without a hidden filter so we can decide which rule
  // applies: a hidden journal exposes ALL its entries; a public journal
  // exposes only the entries explicitly marked is_hidden = true.
  const { data: journal, error: journalError } = await supabase
    .from('journals')
    .select('journal_id, is_hidden')
    .eq('journal_id', journalId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (journalError) throw journalError
  if (!journal) return []

  const query = supabase
    .from('entries')
    .select('*')
    .eq('journal_id', journalId)
    .is('deleted_at', null)
    .order('is_pinned', { ascending: false })
    .order('pinned_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })

  // Belt-and-braces: even when the journal is hidden, the rule "this row
  // should be visible to the hidden surface" must hold per row.
  const filtered = journal.is_hidden ? query : query.eq('is_hidden', true)

  const { data, error } = await filtered
  if (error) throw error
  return data ?? []
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

async function listAllPublicEntries(
  supabase: SupabaseServer,
  userId: string,
): Promise<Entry[]> {
  // One query that returns every entry visible on the public surface:
  // entry.is_hidden=false AND parent journal owned by user, not deleted,
  // not hidden. The inner-join + foreign-table filters mirror publicEntryById.
  type EntryWithJournalFlags = Entry & {
    journals: { user_id: string; is_hidden: boolean; deleted_at: string | null } | null
  }

  const { data, error } = await supabase
    .from('entries')
    .select('*, journals!inner(user_id, is_hidden, deleted_at)')
    .eq('is_hidden', false)
    .is('deleted_at', null)
    .eq('journals.user_id', userId)
    .eq('journals.is_hidden', false)
    .is('journals.deleted_at', null)
    .returns<EntryWithJournalFlags[]>()
  if (error) throw error
  return (data ?? []).map(({ journals: _join, ...entry }) => {
    void _join
    return entry as Entry
  })
}

async function listAllHiddenEntries(
  supabase: SupabaseServer,
  userId: string,
): Promise<Entry[]> {
  // Hidden surface visibility = entry.is_hidden=true OR parent journal
  // is_hidden=true. PostgREST can't combine an entry-level OR with a
  // foreign-table predicate, so we run two queries and merge in code.
  type EntryWithJournalFlags = Entry & {
    journals: { user_id: string; is_hidden: boolean; deleted_at: string | null } | null
  }

  const baseSelect = '*, journals!inner(user_id, is_hidden, deleted_at)'

  const [byEntryFlag, byJournalFlag] = await Promise.all([
    supabase
      .from('entries')
      .select(baseSelect)
      .eq('is_hidden', true)
      .is('deleted_at', null)
      .eq('journals.user_id', userId)
      .is('journals.deleted_at', null)
      .returns<EntryWithJournalFlags[]>(),
    supabase
      .from('entries')
      .select(baseSelect)
      .eq('is_hidden', false)
      .is('deleted_at', null)
      .eq('journals.user_id', userId)
      .eq('journals.is_hidden', true)
      .is('journals.deleted_at', null)
      .returns<EntryWithJournalFlags[]>(),
  ])
  if (byEntryFlag.error) throw byEntryFlag.error
  if (byJournalFlag.error) throw byJournalFlag.error

  const seen = new Set<string>()
  const out: Entry[] = []
  for (const row of [...(byEntryFlag.data ?? []), ...(byJournalFlag.data ?? [])]) {
    if (seen.has(row.entry_id)) continue
    seen.add(row.entry_id)
    const { journals: _join, ...entry } = row
    void _join
    out.push(entry as Entry)
  }
  return out
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
    .select('*, journals!inner(user_id, is_hidden, deleted_at)')
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
