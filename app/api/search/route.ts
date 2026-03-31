import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { extractPlainText } from '@/lib/utils/extractPlainText'
import type { JSONContent } from '@tiptap/core'

const searchParamsSchema = z.object({
  q: z.string().min(1).max(200),
  journalId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  pinned: z.literal('true').optional(),
  tagIds: z.string().optional(),
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

  const rpcArgs: SearchRpcArgs = { p_query: params.q }
  if (params.journalId) rpcArgs.p_journal_id = params.journalId
  if (params.from) rpcArgs.p_from = params.from
  if (params.to) rpcArgs.p_to = params.to
  if (params.pinned === 'true') rpcArgs.p_pinned = true
  if (tagIdArray && tagIdArray.length > 0) rpcArgs.p_tag_ids = tagIdArray

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
      .is('deleted_at', null)
      .ilike('title', likePattern)
      .order('is_favorite', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(5),
    supabase
      .from('journals')
      .select('journal_id, title, description, color, icon, entry_count, is_favorite, updated_at')
      .eq('user_id', session.user.id)
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
  }[] = []

  if (entryResult.error) {
    console.error('Entry search failed:', entryResult.error)
  } else {
    entries = (entryResult.data ?? []).map((row) => {
      const plainText = (() => {
        try {
          if (!row.content || typeof row.content !== 'object') return ''
          return extractPlainText(row.content as JSONContent)
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
      }
    })
  }

  return NextResponse.json({ journals, entries })
}
