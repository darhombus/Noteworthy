import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: entries, error: entriesError }, { data: journals, error: journalsError }] =
    await Promise.all([
      supabase
        .from('entries')
        .select('entry_id, title, deleted_at, journals!inner(title)')
        .not('deleted_at', 'is', null),
      supabase
        .from('journals')
        .select('journal_id, title, deleted_at')
        .eq('user_id', user.id)
        .not('deleted_at', 'is', null),
    ])

  if (entriesError || journalsError) {
    return NextResponse.json({ error: 'Failed to fetch recycle bin' }, { status: 500 })
  }

  const now = Date.now()

  const daysRemaining = (deletedAt: string) =>
    Math.max(0, 30 - Math.floor((now - new Date(deletedAt).getTime()) / 86_400_000))

  type JournalRelation = { title: string }

  const entryItems = (entries ?? []).map((e) => ({
    item_type: 'entry' as const,
    id: e.entry_id,
    title: e.title ?? 'Untitled',
    deleted_at: e.deleted_at as string,
    journal_title: (e.journals as unknown as JournalRelation | null)?.title ?? null,
    days_remaining: daysRemaining(e.deleted_at as string),
  }))

  const journalItems = (journals ?? []).map((j) => ({
    item_type: 'journal' as const,
    id: j.journal_id,
    title: j.title,
    deleted_at: j.deleted_at as string,
    journal_title: null,
    days_remaining: daysRemaining(j.deleted_at as string),
  }))

  const items = [...entryItems, ...journalItems].sort(
    (a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime(),
  )

  return NextResponse.json(items)
}
