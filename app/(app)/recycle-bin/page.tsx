import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RecycleBinClient from '@/components/recycle-bin/RecycleBinClient'
import type { RecycleBinItem } from '@/components/recycle-bin/RecycleBinClient'
import LiveDataRefresh from '@/components/LiveDataRefresh'

export default async function RecycleBinPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now = Date.now()
  const daysRemaining = (deletedAt: string) =>
    Math.max(0, 30 - Math.floor((now - new Date(deletedAt).getTime()) / 86_400_000))

  const [{ data: entries }, { data: journals }] = await Promise.all([
    supabase
      .from('entries')
      .select('entry_id, title, deleted_at, is_hidden, journals!inner(title, is_hidden)')
      .not('deleted_at', 'is', null)
      .eq('is_hidden', false)
      .eq('journals.is_hidden', false),
    supabase
      .from('journals')
      .select('journal_id, title, deleted_at')
      .eq('user_id', user.id)
      .eq('is_hidden', false)
      .not('deleted_at', 'is', null),
  ])

  type JournalRelation = { title: string }

  const entryItems: RecycleBinItem[] = (entries ?? []).map((e) => ({
    item_type: 'entry',
    id: e.entry_id,
    title: e.title ?? 'Untitled',
    deleted_at: e.deleted_at as string,
    journal_title: (e.journals as unknown as JournalRelation | null)?.title ?? null,
    days_remaining: daysRemaining(e.deleted_at as string),
  }))

  const journalItems: RecycleBinItem[] = (journals ?? []).map((j) => ({
    item_type: 'journal',
    id: j.journal_id,
    title: j.title,
    deleted_at: j.deleted_at as string,
    journal_title: null,
    days_remaining: daysRemaining(j.deleted_at as string),
  }))

  const initialItems = [...entryItems, ...journalItems].sort(
    (a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime(),
  )

  return (
    <>
      <LiveDataRefresh />
      <RecycleBinClient initialItems={initialItems} />
    </>
  )
}
