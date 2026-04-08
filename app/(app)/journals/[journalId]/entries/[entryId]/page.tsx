import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EntryEditor from '@/components/entries/EntryEditor'

interface EntryPageProps {
  params: Promise<{ journalId: string; entryId: string }>
}

interface RawEntryTag {
  tags: { tag_id: string; tag_name: string; color: string } | null
}

export default async function EntryPage({ params }: EntryPageProps) {
  const { journalId, entryId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: entry }, { data: journal }, { data: rawEntryTags }] = await Promise.all([
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
    supabase
      .from('entry_tags')
      .select('tags(tag_id, tag_name, color)')
      .eq('entry_id', entryId),
  ])

  if (!entry || !journal) notFound()

  const initialTags = ((rawEntryTags ?? []) as unknown as RawEntryTag[])
    .map((et) => et.tags)
    .filter((t): t is { tag_id: string; tag_name: string; color: string } => t !== null)

  return (
    <EntryEditor
      key={entry.entry_id}
      entry={entry}
      journal={journal}
      initialTags={initialTags}
    />
  )
}
