import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { publicScope } from '@/lib/data/scope'
import EntryEditor from '@/components/entries/EntryEditor'
import BreadcrumbTitle from '@/components/layout/BreadcrumbTitle'

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

  // Public route. publicScope.entries.byId enforces "entry is_hidden=false
  // AND parent journal is_hidden=false" — a hidden entry under a public
  // journal, OR any entry under a hidden journal, returns null and 404s.
  const scope = await publicScope(user.id)
  const [entry, journal] = await Promise.all([
    scope.entries.byId(entryId),
    scope.journals.byId(journalId),
  ])

  if (!entry || !journal) notFound()
  // Defence in depth: the URL must match the entry's actual parent.
  if (entry.journal_id !== journal.journal_id) notFound()

  const { data: rawEntryTags } = await supabase
    .from('entry_tags')
    .select('tags(tag_id, tag_name, color)')
    .eq('entry_id', entryId)

  const initialTags = ((rawEntryTags ?? []) as unknown as RawEntryTag[])
    .map((et) => et.tags)
    .filter((t): t is { tag_id: string; tag_name: string; color: string } => t !== null)

  return (
    <>
      <BreadcrumbTitle id={journal.journal_id} title={journal.title} />
      <BreadcrumbTitle id={entry.entry_id} title={entry.title?.trim() || 'Untitled'} />
      <EntryEditor
        key={entry.entry_id}
        entry={entry}
        journal={journal}
        initialTags={initialTags}
      />
    </>
  )
}
