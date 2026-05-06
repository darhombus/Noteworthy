import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isBinRevealed } from '@/lib/privacy/binReveal'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Reveal is gated solely by the bin-reveal cookie — disjoint from
  // the vault. Mirrors the SSR page so polling stays in sync.
  const reveal = await isBinRevealed(user.id)

  const [
    { data: entries, error: entriesError },
    { data: journals, error: journalsError },
  ] = await Promise.all([
    supabase
      .from('entries')
      .select('entry_id, title, deleted_at, is_hidden, journals!inner(title, is_hidden, user_id)')
      .not('deleted_at', 'is', null)
      .eq('journals.user_id', user.id),
    supabase
      .from('journals')
      .select('journal_id, title, deleted_at, is_hidden')
      .eq('user_id', user.id)
      .not('deleted_at', 'is', null),
  ])

  if (entriesError || journalsError) {
    return NextResponse.json({ error: 'Failed to fetch recycle bin' }, { status: 500 })
  }

  const now = Date.now()
  const daysRemaining = (deletedAt: string) =>
    Math.max(0, 30 - Math.floor((now - new Date(deletedAt).getTime()) / 86_400_000))

  type JournalRelation = { title: string; is_hidden: boolean; user_id: string }

  const entryItems = (entries ?? []).map((e) => {
    const journal = e.journals as unknown as JournalRelation | null
    const journalHidden = journal?.is_hidden ?? false
    const requiresVault = !!e.is_hidden || journalHidden
    const locked = requiresVault && !reveal
    return {
      item_type: 'entry' as const,
      id: e.entry_id,
      title: locked ? 'Hidden entry' : (e.title ?? 'Untitled'),
      deleted_at: e.deleted_at as string,
      journal_title: locked
        ? journalHidden
          ? 'Hidden journal'
          : (journal?.title ?? null)
        : (journal?.title ?? null),
      days_remaining: daysRemaining(e.deleted_at as string),
      requires_vault: requiresVault,
      locked,
    }
  })

  const journalItems = (journals ?? []).map((j) => {
    const requiresVault = j.is_hidden
    const locked = requiresVault && !reveal
    return {
      item_type: 'journal' as const,
      id: j.journal_id,
      title: locked ? 'Hidden journal' : j.title,
      deleted_at: j.deleted_at as string,
      journal_title: null,
      days_remaining: daysRemaining(j.deleted_at as string),
      requires_vault: requiresVault,
      locked,
    }
  })

  const items = [...entryItems, ...journalItems].sort(
    (a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime(),
  )

  return NextResponse.json(items)
}
