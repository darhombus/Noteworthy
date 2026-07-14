import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isVaultOpen } from '@/lib/privacy/vault'

/**
 * Snapshot endpoint for the global Cmd+K search overlay.
 *
 * Returns every journal + entry visible on the requested surface in one
 * round trip. The overlay caches the result in memory for the lifetime
 * of the modal and filters it client-side on every keystroke, so typing
 * never hits the network — that's what eliminates the spinner-then-jolt
 * glitch the per-keystroke /api/search route caused.
 *
 * Surface gating mirrors search_entries() and the scope.ts data layer:
 *   • public  → entries.is_hidden=false AND journals.is_hidden=false
 *   • hidden  → vault must be open; entries.is_hidden=true OR journals.is_hidden=true
 *
 * RLS remains the security boundary on the underlying table reads.
 */

const querySchema = z.object({
  surface: z.enum(['public', 'hidden']),
})

interface IndexEntry {
  entry_id: string
  title: string | null
  journal_id: string
  journal_title: string
  journal_color: string
  journal_is_hidden: boolean
  /** The entry's own is_hidden flag. Surfaced so the overlay can mark
   *  entries that will stay hidden even if the parent journal is later
   *  unhidden (both flags true) and distinguish them from standalone
   *  hidden entries (only entry_is_hidden true). */
  entry_is_hidden: boolean
  entry_date: string
  word_count: number
  is_pinned: boolean
  is_favorite: boolean
  search_text: string
  tags: Array<{ tag_id: string; tag_name: string; color: string }>
}

interface IndexJournal {
  journal_id: string
  title: string
  description: string | null
  color: string
  icon: string
  entry_count: number
  is_favorite: boolean
}

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid surface' }, { status: 400 })
  }
  const { surface } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (surface === 'hidden' && !(await isVaultOpen(userId))) {
    // Not an unauthorized condition — the user IS authenticated. The vault
    // is the gate, and "locked" is a normal app state. Return 200 with a
    // status discriminator so the overlay can render its locked placeholder
    // without DevTools flagging a red 401 on every overlay open / surface
    // flip into hidden.
    return NextResponse.json({ status: 'locked', journals: [], entries: [] })
  }

  const journalSurfaceMatch = surface === 'hidden'
  const [entriesResult, journalsResult] = await Promise.all([
    supabase.rpc('search_index_entries', { p_user_id: userId, p_scope: surface }),
    supabase
      .from('journals')
      .select('journal_id, title, description, color, icon, entry_count, is_favorite, updated_at')
      .eq('user_id', userId)
      .eq('is_hidden', journalSurfaceMatch)
      .is('deleted_at', null)
      .order('is_favorite', { ascending: false })
      .order('updated_at', { ascending: false }),
  ])

  if (entriesResult.error) {
    console.error('search index entries:', entriesResult.error)
    return NextResponse.json({ error: 'Index failed' }, { status: 500 })
  }
  if (journalsResult.error) {
    console.error('search index journals:', journalsResult.error)
    return NextResponse.json({ error: 'Index failed' }, { status: 500 })
  }

  type RpcRow = {
    entry_id: string
    title: string | null
    journal_id: string
    journal_title: string
    journal_color: string
    journal_is_hidden: boolean
    entry_is_hidden: boolean
    entry_date: string
    word_count: number
    is_pinned: boolean
    is_favorite: boolean
    search_text: string | null
    tags: Array<{ tag_id: string; tag_name: string; color: string }> | null
  }

  const entries: IndexEntry[] = (
    (entriesResult.data ?? []) as unknown as RpcRow[]
  ).map((row) => ({
    entry_id: row.entry_id,
    title: row.title,
    journal_id: row.journal_id,
    journal_title: row.journal_title,
    journal_color: row.journal_color,
    journal_is_hidden: row.journal_is_hidden,
    entry_is_hidden: row.entry_is_hidden,
    entry_date: row.entry_date,
    word_count: row.word_count,
    is_pinned: row.is_pinned,
    is_favorite: row.is_favorite,
    search_text: row.search_text ?? '',
    tags: Array.isArray(row.tags) ? row.tags : [],
  }))

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

  const journals: IndexJournal[] = ((journalsResult.data ?? []) as JournalRow[]).map(
    (j) => ({
      journal_id: j.journal_id,
      title: j.title,
      description: j.description,
      color: j.color,
      icon: j.icon,
      entry_count: j.entry_count,
      is_favorite: j.is_favorite,
    }),
  )

  return NextResponse.json({ journals, entries })
}
