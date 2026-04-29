import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isVaultOpen } from '@/lib/privacy/vault'

/**
 * Required query params:
 *   q          — text query (defaults to '')
 *   surface    — 'public' | 'hidden' (REQUIRED)
 * Optional:
 *   journalId, from, to, pinned, tagIds
 *
 * The `surface` discriminator is the security boundary. Hidden surface
 * callers must have an open vault — otherwise 401. Public callers can
 * never see hidden content because:
 *   • search_entries() filters BOTH entries.is_hidden AND
 *     journals.is_hidden when p_scope='public' (migration 014).
 *   • The journal title/description query and the tag-only query both
 *     apply the same is_hidden filters in app code.
 *
 * Hot path: this handler runs on every keystroke in the global Cmd+K
 * overlay. The two latency-killers were (1) calling auth.getUser() here
 * after proxy.ts already validated the session, and (2) firing five
 * separate DB round trips per query. Both fixed below: the session is
 * read locally (no network), and tags + journal_is_hidden are folded
 * into search_entries() (migration 021), so a text search is now one
 * RPC call + one journal title/description .or() in parallel.
 */
const searchParamsSchema = z.object({
  q: z.string().max(200).optional().transform((v) => v ?? ''),
  surface: z.enum(['public', 'hidden']),
  journalId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  pinned: z.literal('true').optional(),
  tagIds: z.string().optional(),
})

type Surface = 'public' | 'hidden'

interface SearchEntryHit {
  entry_id: string
  title: string | null
  journal_id: string
  journal_title: string
  journal_color: string
  entry_date: string
  word_count: number
  is_pinned: boolean
  /** Whether the entry's parent journal itself has is_hidden=true. Used by
   *  the hidden surface to decide between /hidden/<jid>/<eid> (nested) and
   *  /hidden/entry/<eid> (standalone — entry hidden inside a public
   *  journal). Always false on the public surface. */
  journal_is_hidden: boolean
  snippet: string
  matched_terms: string[]
  tags: Array<{ tag_id: string; tag_name: string; color: string }>
}

function deriveMatchedTerms(text: string, queryWords: string[]): string[] {
  if (!text || queryWords.length === 0) return []
  const lowerText = text.toLowerCase()
  return queryWords.filter((w) => {
    const lw = w.trim().toLowerCase()
    return lw.length > 0 && lowerText.includes(lw)
  })
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const rawParams: Record<string, string> = {}
  searchParams.forEach((value, key) => {
    rawParams[key] = value
  })

  const parsed = searchParamsSchema.safeParse(rawParams)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid search parameters', details: parsed.error.issues },
      { status: 400 },
    )
  }
  const params = parsed.data

  const supabase = await createClient()
  // proxy.ts has already validated and refreshed the session for this
  // request — calling auth.getUser() here repeats a network round trip
  // to Supabase Auth (~150ms). Read the session locally instead. RLS is
  // still the security boundary on every query below.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const userId = session?.user.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Hidden surface requires the vault to be open. Stale tabs that lost
  // the unlock window get a clean 401 they can branch on.
  if (params.surface === 'hidden' && !(await isVaultOpen(userId))) {
    return NextResponse.json({ error: 'vault_locked' }, { status: 401 })
  }

  const tagIdArray = params.tagIds
    ? params.tagIds
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    : undefined

  const hasTextQuery = params.q.length > 0
  const hasTagFilter = !!(tagIdArray && tagIdArray.length > 0)

  if (!hasTextQuery && !hasTagFilter) {
    return NextResponse.json({ journals: [], entries: [] })
  }

  // ── Tag-only mode ──────────────────────────────────────────────────────────
  // No text query but tag IDs are present: skip the FTS RPC and query
  // entries by tag relationship directly. Surface filter is applied
  // through the inner-join on journals.
  if (!hasTextQuery && hasTagFilter) {
    return tagOnlySearch(supabase, params.surface, params, tagIdArray!)
  }

  return textSearch(supabase, params.surface, userId, params, tagIdArray)
}

// ---------------------------------------------------------------------------
// Text search (uses the search_entries RPC + journal title/description)
// ---------------------------------------------------------------------------

async function textSearch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  surface: Surface,
  userId: string,
  params: z.infer<typeof searchParamsSchema>,
  tagIdArray: string[] | undefined,
): Promise<NextResponse> {
  const queryWords = params.q.trim().split(/\s+/).filter(Boolean)

  // PostgREST's .or() expects literal commas between predicates and
  // percent-style wildcards on each side of an ilike. The user query
  // can contain neither special character without breaking the parser,
  // so escape both before interpolating.
  const safeForOr = params.q.replace(/[,()]/g, ' ')
  const orFilter = `title.ilike.%${safeForOr}%,description.ilike.%${safeForOr}%`

  // Per-journal search (EntryList passes journalId) doesn't care about
  // matching journal titles or descriptions — those would never be the
  // current journal anyway. Skip that query entirely in that mode so
  // the global overlay's 2 round trips become 1 here.
  const wantJournalMatches = !params.journalId

  const journalSurfaceMatch = surface === 'hidden'
  const [entryResult, journalsResult] = await Promise.all([
    supabase.rpc('search_entries', {
      p_user_id: userId,
      p_query: params.q,
      p_scope: surface,
      p_journal_id: params.journalId,
      p_from: params.from,
      p_to: params.to,
      p_pinned: params.pinned === 'true' ? true : undefined,
      p_tag_ids: tagIdArray,
    }),
    wantJournalMatches
      ? supabase
          .from('journals')
          .select('journal_id, title, description, color, icon, entry_count, is_favorite, updated_at')
          .eq('user_id', userId)
          .eq('is_hidden', journalSurfaceMatch)
          .is('deleted_at', null)
          .or(orFilter)
          .order('is_favorite', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null } as const),
  ])

  type JournalRow = {
    journal_id: string
    title: string
    description: string | null
    color: string
    icon: string
    entry_count: number
    is_favorite: boolean
    updated_at: string
  }

  let journals: Omit<JournalRow, 'updated_at'>[] = []
  if (journalsResult.error) {
    console.error('Journal search failed:', journalsResult.error)
  } else {
    journals = ((journalsResult.data ?? []) as JournalRow[]).map((j) => ({
      journal_id: j.journal_id,
      title: j.title,
      description: j.description,
      color: j.color,
      icon: j.icon,
      entry_count: j.entry_count,
      is_favorite: j.is_favorite,
    }))
  }

  // Process entry hits. Tags + parent journal hidden flag are returned
  // by the RPC itself (migration 021), so no follow-up queries.
  type RpcRow = {
    entry_id: string
    title: string | null
    journal_id: string
    journal_title: string
    journal_color: string
    journal_is_hidden: boolean
    entry_date: string
    word_count: number
    is_pinned: boolean
    snippet: string
    tags: Array<{ tag_id: string; tag_name: string; color: string }> | null
  }

  let entries: SearchEntryHit[] = []
  if (entryResult.error) {
    console.error('Entry search failed:', entryResult.error)
  } else {
    const rows = (entryResult.data ?? []) as unknown as RpcRow[]
    entries = rows.map((row) => {
      const snippet = row.snippet ?? ''
      const matched_terms = deriveMatchedTerms(`${row.title ?? ''} ${snippet}`, queryWords)
      return {
        entry_id: row.entry_id,
        title: row.title,
        journal_id: row.journal_id,
        journal_title: row.journal_title,
        journal_color: row.journal_color,
        entry_date: row.entry_date,
        word_count: row.word_count,
        is_pinned: row.is_pinned,
        journal_is_hidden: row.journal_is_hidden,
        snippet,
        matched_terms,
        tags: Array.isArray(row.tags) ? row.tags : [],
      }
    })
  }

  return NextResponse.json({ journals, entries })
}

// ---------------------------------------------------------------------------
// Tag-only mode (no FTS query, just tags + optional date/pinned/journal filters)
// ---------------------------------------------------------------------------

async function tagOnlySearch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  surface: Surface,
  params: z.infer<typeof searchParamsSchema>,
  tagIdArray: string[],
): Promise<NextResponse> {
  const { data: tagEntryRows, error: tagEntryError } = await supabase
    .from('entry_tags')
    .select('entry_id')
    .in('tag_id', tagIdArray)
  if (tagEntryError) {
    console.error('Tag-only search (entry_tags):', tagEntryError)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }

  const entryIds = [...new Set((tagEntryRows ?? []).map((r) => r.entry_id))]
  if (entryIds.length === 0) {
    return NextResponse.json({ journals: [], entries: [] })
  }

  type TagOnlyRow = {
    entry_id: string
    title: string | null
    journal_id: string
    entry_date: string
    word_count: number
    is_pinned: boolean
    is_hidden: boolean
    journals: { title: string; color: string; is_hidden: boolean } | null
    entry_tags: Array<{ tags: { tag_id: string; tag_name: string; color: string } | null }>
  }

  const SELECT =
    'entry_id, title, journal_id, entry_date, word_count, is_pinned, is_hidden, ' +
    'journals!inner(title, color, is_hidden), ' +
    'entry_tags(tags(tag_id, tag_name, color))'

  function buildBaseQuery() {
    let q = supabase
      .from('entries')
      .select(SELECT)
      .in('entry_id', entryIds)
      .is('deleted_at', null)
    if (params.journalId) q = q.eq('journal_id', params.journalId)
    if (params.from) q = q.gte('entry_date', params.from)
    if (params.to) q = q.lte('entry_date', params.to)
    if (params.pinned === 'true') q = q.eq('is_pinned', true)
    return q
  }

  // Push the surface gate into Postgres. PostgREST can't express
  //   entry.is_hidden = true OR journal.is_hidden = true
  // in a single query (the OR can't span a foreign-table predicate), so the
  // hidden surface runs two AND-shaped queries and merges in code. The
  // public surface is a clean AND and stays one query.
  let rawRows: TagOnlyRow[]
  if (surface === 'public') {
    const { data, error } = await buildBaseQuery()
      .eq('is_hidden', false)
      .eq('journals.is_hidden', false)
      .order('is_pinned', { ascending: false })
      .order('entry_date', { ascending: false })
      .limit(20)
    if (error) {
      console.error('Tag-only search (entries):', error)
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }
    rawRows = (data ?? []) as unknown as TagOnlyRow[]
  } else {
    const [byEntry, byJournal] = await Promise.all([
      buildBaseQuery()
        .eq('is_hidden', true)
        .order('is_pinned', { ascending: false })
        .order('entry_date', { ascending: false })
        .limit(20),
      buildBaseQuery()
        .eq('is_hidden', false)
        .eq('journals.is_hidden', true)
        .order('is_pinned', { ascending: false })
        .order('entry_date', { ascending: false })
        .limit(20),
    ])
    if (byEntry.error || byJournal.error) {
      console.error('Tag-only search (entries):', byEntry.error ?? byJournal.error)
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }

    const seen = new Set<string>()
    const merged: TagOnlyRow[] = []
    for (const row of [
      ...((byEntry.data ?? []) as unknown as TagOnlyRow[]),
      ...((byJournal.data ?? []) as unknown as TagOnlyRow[]),
    ]) {
      if (seen.has(row.entry_id)) continue
      seen.add(row.entry_id)
      merged.push(row)
    }
    merged.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
      return b.entry_date.localeCompare(a.entry_date)
    })
    rawRows = merged.slice(0, 20)
  }

  const entries: SearchEntryHit[] = rawRows.map((row) => {
    const tags = (row.entry_tags ?? [])
      .map((et) => et.tags)
      .filter((t): t is { tag_id: string; tag_name: string; color: string } => t !== null)
    return {
      entry_id: row.entry_id,
      title: row.title,
      journal_id: row.journal_id,
      journal_title: row.journals?.title ?? '',
      journal_color: row.journals?.color ?? '#1976D2',
      entry_date: row.entry_date,
      word_count: row.word_count,
      is_pinned: row.is_pinned,
      journal_is_hidden: row.journals?.is_hidden ?? false,
      snippet: '',
      matched_terms: [],
      tags,
    }
  })

  return NextResponse.json({ journals: [], entries })
}
