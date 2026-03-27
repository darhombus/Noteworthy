import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EntryEditor from '@/components/entries/EntryEditor'

interface EntryPageProps {
  params: Promise<{ journalId: string; entryId: string }>
}

export default async function EntryPage({ params }: EntryPageProps) {
  const { journalId, entryId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: entry }, { data: journal }] = await Promise.all([
    supabase
      .from('entries')
      .select('*')
      .eq('entry_id', entryId)
      .is('deleted_at', null)
      .single(),
    supabase
      .from('journals')
      .select('journal_id, title, color')
      .eq('journal_id', journalId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single(),
  ])

  if (!entry || !journal) notFound()

  return <EntryEditor key={entry.updated_at} entry={entry} journal={journal} />
}
