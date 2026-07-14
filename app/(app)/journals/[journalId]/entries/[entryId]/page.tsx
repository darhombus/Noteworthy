import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/auth/server'
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
  const userId = await getCurrentUserId()
  if (!userId) redirect('/login')
  const supabase = await createClient()

  // Public route. publicScope.entries.byId enforces "entry is_hidden=false
  // AND parent journal is_hidden=false" — a hidden entry under a public
  // journal, OR any entry under a hidden journal, returns null and 404s.
  // Tags fetch is unconditional (even if the entry/journal turn out to be
  // hidden) — RLS guards the rows, and parallelising the three queries
  // saves one round-trip per page load.
  const scope = await publicScope(userId)
  const [entry, journal, rawEntryTagsResult] = await Promise.all([
    scope.entries.byId(entryId),
    scope.journals.byId(journalId),
    supabase
      .from('entry_tags')
      .select('tags(tag_id, tag_name, color)')
      .eq('entry_id', entryId),
  ])

  if (!entry || !journal) notFound()
  // Defence in depth: the URL must match the entry's actual parent.
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
