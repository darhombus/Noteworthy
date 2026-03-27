import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EntryList from '@/components/entries/EntryList'

interface JournalPageProps {
  params: Promise<{ journalId: string }>
}

export default async function JournalPage({ params }: JournalPageProps) {
  const { journalId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: journal }, { data: entries }] = await Promise.all([
    supabase
      .from('journals')
      .select('*')
      .eq('journal_id', journalId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single(),
    supabase
      .from('entries')
      .select('*')
      .eq('journal_id', journalId)
      .is('deleted_at', null)
      .order('is_pinned', { ascending: false })
      .order('entry_date', { ascending: false }),
  ])

  if (!journal) notFound()

  return <EntryList journal={journal} entries={entries ?? []} />
}
