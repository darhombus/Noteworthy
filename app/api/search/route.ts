import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isVaultOpen } from '@/lib/privacy/vault'
import { extractPlainText, type RichTextNode } from '@/lib/utils/extractPlainText'

const searchParamsSchema = z.object({
  q: z.string().max(200).optional().transform((v) => v ?? ''),
  journalId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  pinned: z.literal('true').optional(),
  tagIds: z.string().optional(),
  scope: z.literal('hidden').optional(),
})

type SearchRpcRow = {
  entry_id: string
  title: string | null
  journal_id: string
  journal_title: string
  journal_color: string
  entry_date: string
  word_count: number
  is_pinned: boolean
  content: unknown
}

type SearchRpcArgs = {
  p_query: string
  p_journal_id?: string
  p_from?: string
  p_to?: string
  p_pinned?: boolean
  p_tag_ids?: string[]
  p_include_hidden?: boolean
}

type SearchRpcClient = {
  rpc(
    fn: 'search_entries',
    args: SearchRpcArgs,
  ): Promise<{ data: SearchRpcRow[] | null; error: { message: string } | null }>
}

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

function buildContextualSnippet(plainText: string, queryWords: string[]): string {
  if (!plainText) return ''

  const lowerText = plainText.toLowerCase()
  const matchIndexes: number[] = []

  for (const term of queryWords) {
    if (!term.trim()) continue
    const lowerTerm = term.toLowerCase()
    const idx = lowerText.indexOf(lowerTerm)
    if (idx !== -1) matchIndexes.push(idx)
  }

  if (matchIndexes.length === 0) {
    return plainText.length > 200 ? plainText.slice(0, 200) + '\u2026' : plainText
  }

  const matchIndex = Math.min(...matchIndexes)
  let start = Math.max(0, matchIndex - 60)
  const end = start + 200

  if (start > 0) {
    const spaceIdx = plainText.indexOf(' ', start)
    if (spaceIdx !== -1 && spaceIdx < end) {
      start = spaceIdx + 1
    }
  }

  const sliced = plainText.slice(start, end).trim()
  const prefix = start > 0 ? '\u2026' : ''
  const suffix = end < plainText.length ? '\u2026' : ''

  return prefix + sliced + suffix
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
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tagIdArray = params.tagIds
    ? params.tagIds
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    : undefined

  const hasTextQuery = params.q.length > 0
  const hasTagFilter = !!(tagIdArray && tagIdArray.length > 0)

  // Nothing to search
  if (!hasTextQuery && !hasTagFilter) {
    return NextResponse.json({ journals: [], entries: [] })
  }

  // ── Scope: hidden ──────────────────────────────────────────────────────────
  // EntryList passes scope=hidden when rendered under /hidden/journals/<id> so
  // the user can search/filter within an unlocked hidden journal. We only
  // honour it when (a) the vault is open, (b) a journalId is provided, and
  // (c) that journal is owned by the user and is itself is_hidden=true.
  // Any failure falls back to "exclude hidden" rather than 4xx so a stale
  // tab doesn't surface a confusing error mid-search.
  let includeHidden = false
  if (params.scope === 'hidden') {
    if (params.journalId && (await isVaultOpen(session.user.id))) {
      const { data: hiddenJournal } = await supabase
        .from('journals')
        .select('journal_id')
        .eq('journal_id', params.journalId)
        .eq('user_id', session.user.id)
        .eq('is_hidden', true)
        .is('deleted_at', null)
        .maybeSingle()
      if (hiddenJournal) includeHidden = true
    }
  }

  // ── Tag-only mode ──────────────────────────────────────────────────────────
  // When there is no text query but tag IDs are present, skip the FTS RPC and
  // query entries by tag relationship directly.
  if (!hasTextQuery && hasTagFilter) {
    const { data: tagEntryRows, error: tagEntryError } = await supabase
      .from('entry_tags')
      .select('entry_id')
      .in('tag_id', tagIdArray!)

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
      content: unknown
      journals: { title: string; color: string } | null
      entry_tags: Array<{ tags: { tag_id: string; tag_name: string; color: string } | null }>
    }

    let tagOnlyQuery = supabase
      .from('entries')
      .select(
        'entry_id, title, journal_id, entry_date, word_count, is_pinned, content, ' +
        'journals!inner(title, color, is_hidden), ' +
        'entry_tags(tags(tag_id, tag_name, color))',
      )
      .in('entry_id', entryIds)
      .is('deleted_at', null)

    if (!includeHidden) {
      tagOnlyQuery = tagOnlyQuery
        .eq('is_hidden', false)
        .eq('journals.is_hidden', false)
    }

    if (params.journalId) tagOnlyQuery = tagOnlyQuery.eq('journal_id', params.journalId)
    if (params.from) tagOnlyQuery = tagOnlyQuery.gte('entry_date', params.from)
    if (params.to) tagOnlyQuery = tagOnlyQuery.lte('entry_date', params.to)
    if (params.pinned === 'true') tagOnlyQuery = tagOnlyQuery.eq('is_pinned', true)

    const { data: tagOnlyRows, error: tagOnlyError } = await tagOnlyQuery
      .order('is_pinned', { ascending: false })
      .order('entry_date', { ascending: false })
      .limit(20)

    if (tagOnlyError) {
      console.error('Tag-only search (entries):', tagOnlyError)
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }

    const tagOnlyEntries = (tagOnlyRows as unknown as TagOnlyRow[]).map((row) => {
      const plainText = (() => {
        try {
          if (!row.content || typeof row.content !== 'object') return ''
          return extractPlainText(row.content as RichTextNode)
        } catch {
          return ''
        }
      })()
      const snippet = buildContextualSnippet(plainText, [])

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
        snippet,
        matched_terms: [] as string[],
        tags,
      }
    })

    return NextResponse.json({ journals: [], entries: tagOnlyEntries })
  }
  // ──────────────────────────────────────────────────────────────────────────

  const rpcArgs: SearchRpcArgs = { p_query: params.q }
  if (params.journalId) rpcArgs.p_journal_id = params.journalId
  if (params.from) rpcArgs.p_from = params.from
  if (params.to) rpcArgs.p_to = params.to
  if (params.pinned === 'true') rpcArgs.p_pinned = true
  if (tagIdArray && tagIdArray.length > 0) rpcArgs.p_tag_ids = tagIdArray
  if (includeHidden) rpcArgs.p_include_hidden = true

  const queryWords = params.q.trim().split(/\s+/).filter(Boolean)
  const likePattern = `%${params.q}%`

  // Run entry search and journal search (title + description) in parallel.
  // Journal filters (journalId, from, to, pinned, tagIds) are entry-only.
  const [entryResult, journalTitleResult, journalDescResult] = await Promise.all([
    (supabase as unknown as SearchRpcClient).rpc('search_entries', rpcArgs),
    supabase
      .from('journals')
      .select('journal_id, title, description, color, icon, entry_count, is_favorite, updated_at')
      .eq('user_id', session.user.id)
      .eq('is_hidden', false)
      .is('deleted_at', null)
      .ilike('title', likePattern)
      .order('is_favorite', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(5),
    supabase
      .from('journals')
      .select('journal_id, title, description, color, icon, entry_count, is_favorite, updated_at')
      .eq('user_id', session.user.id)
      .eq('is_hidden', false)
      .is('deleted_at', null)
      .ilike('description', likePattern)
      .order('is_favorite', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(5),
  ])

  // Merge journal results, deduplicate, re-sort, limit 5
  let journals: {
    journal_id: string
    title: string
    description: string | null
    color: string
    icon: string
    entry_count: number
    is_favorite: boolean
  }[] = []

  if (journalTitleResult.error || journalDescResult.error) {
    console.error(
      'Journal search failed:',
      journalTitleResult.error ?? journalDescResult.error,
    )
  } else {
    const seen = new Set<string>()
    const merged: JournalRow[] = []
    for (const row of [
      ...(journalTitleResult.data as JournalRow[] ?? []),
      ...(journalDescResult.data as JournalRow[] ?? []),
    ]) {
      if (!seen.has(row.journal_id)) {
        seen.add(row.journal_id)
        merged.push(row)
      }
    }
    merged.sort((a, b) => {
      if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1
      return b.updated_at.localeCompare(a.updated_at)
    })
    journals = merged.slice(0, 5).map((j) => ({
      journal_id: j.journal_id,
      title: j.title,
      description: j.description,
      color: j.color,
      icon: j.icon,
      entry_count: j.entry_count,
      is_favorite: j.is_favorite,
    }))
  }

  // Fetch tags for all returned entries in one query
  type EntryTagRow = {
    entry_id: string
    tags: { tag_id: string; tag_name: string; color: string } | null
  }
  const ftsEntryIds = (entryResult.data ?? []).map((r) => r.entry_id)
  const tagMap = new Map<string, Array<{ tag_id: string; tag_name: string; color: string }>>()

  if (ftsEntryIds.length > 0) {
    const { data: entryTagRows } = await supabase
      .from('entry_tags')
      .select('entry_id, tags(tag_id, tag_name, color)')
      .in('entry_id', ftsEntryIds)

    for (const row of (entryTagRows as unknown as EntryTagRow[]) ?? []) {
      if (!row.tags) continue
      const list = tagMap.get(row.entry_id) ?? []
      list.push(row.tags)
      tagMap.set(row.entry_id, list)
    }
  }

  // Process entries
  let entries: {
    entry_id: string
    title: string | null
    journal_id: string
    journal_title: string
    journal_color: string
    entry_date: string
    word_count: number
    is_pinned: boolean
    snippet: string
    matched_terms: string[]
    tags: Array<{ tag_id: string; tag_name: string; color: string }>
  }[] = []

  if (entryResult.error) {
    console.error('Entry search failed:', entryResult.error)
  } else {
    entries = (entryResult.data ?? []).map((row) => {
      const plainText = (() => {
        try {
          if (!row.content || typeof row.content !== 'object') return ''
          return extractPlainText(row.content as RichTextNode)
        } catch {
          return ''
        }
      })()

      const snippet = buildContextualSnippet(plainText, queryWords)

      const lowerTitle = (row.title ?? '').toLowerCase()
      const lowerText = plainText.toLowerCase()
      const matched_terms = queryWords.filter((w) => {
        const lw = w.toLowerCase()
        return lowerTitle.includes(lw) || lowerText.includes(lw)
      })

      return {
        entry_id: row.entry_id,
        title: row.title,
        journal_id: row.journal_id,
        journal_title: row.journal_title,
        journal_color: row.journal_color,
        entry_date: row.entry_date,
        word_count: row.word_count,
        is_pinned: row.is_pinned,
        snippet,
        matched_terms,
        tags: tagMap.get(row.entry_id) ?? [],
      }
    })
  }

  return NextResponse.json({ journals, entries })
}
