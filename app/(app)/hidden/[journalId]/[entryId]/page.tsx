import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/auth/server'
import { hiddenScope } from '@/lib/data/scope'
import { isVaultOpen } from '@/lib/privacy/vault'
import EntryEditor from '@/components/entries/EntryEditor'
import BreadcrumbTitle from '@/components/layout/BreadcrumbTitle'

interface EntryPageProps {
  params: Promise<{ journalId: string; entryId: string }>
}

interface RawEntryTag {
  tags: { tag_id: string; tag_name: string; color: string } | null
}

export default async function HiddenEntryPage({ params }: EntryPageProps) {
  const { journalId, entryId } = await params
  const userId = await getCurrentUserId()
  if (!userId) redirect('/login')
  const supabase = await createClient()

  if (!(await isVaultOpen(userId))) redirect('/hidden')

  const scope = await hiddenScope(userId)
  const [entry, journal, rawEntryTagsResult] = await Promise.all([
    scope.entries.byId(entryId),
    scope.journals.byId(journalId),
    supabase
      .from('entry_tags')
      .select('tags(tag_id, tag_name, color)')
      .eq('entry_id', entryId),
  ])

  if (!entry || !journal) notFound()
  if (entry.journal_id !== journal.journal_id) notFound()

  const initialTags = ((rawEntryTagsResult.data ?? []) as unknown as RawEntryTag[])
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
