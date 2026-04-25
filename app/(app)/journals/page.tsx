import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import JournalGrid from '@/components/journals/JournalGrid'
import LiveDataRefresh from '@/components/LiveDataRefresh'

export default async function JournalsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: journals }, { data: visibleEntryRows }] = await Promise.all([
    supabase
      .from('journals')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_hidden', false)
      .is('deleted_at', null)
      .order('is_favorite', { ascending: false })
      .order('updated_at', { ascending: false }),
    // The stored journals.entry_count is maintained by a DB trigger that
    // counts *all* entries (hidden or not). The card shows only entries the
    // user can see, so we count visible (non-hidden, non-deleted) entries
    // per journal here and override entry_count before passing down.
    supabase
      .from('entries')
      .select('journal_id')
      .eq('is_hidden', false)
      .is('deleted_at', null),
  ])

  const visibleCountByJournal = new Map<string, number>()
  for (const row of visibleEntryRows ?? []) {
    visibleCountByJournal.set(
      row.journal_id,
      (visibleCountByJournal.get(row.journal_id) ?? 0) + 1,
    )
  }

  const journalsWithVisibleCount = (journals ?? []).map((j) => ({
    ...j,
    entry_count: visibleCountByJournal.get(j.journal_id) ?? 0,
  }))

  return (
    <>
      <LiveDataRefresh />
      <JournalGrid journals={journalsWithVisibleCount} />
    </>
  )
}
